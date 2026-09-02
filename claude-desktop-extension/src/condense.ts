/**
 * Concise renderings of the scraper payloads, for a model's context window.
 *
 * The scrapers are the faithful layer. Each one returns everything MyChart
 * actually sent for a category — Epic's own field names, minus what is
 * provably useless — and that is the right contract for a library: a caller
 * that needs `IsPreadmissionEnabled` can have it. It is the wrong contract for
 * a chat model. `get_past_visits` against a modest chart is a 200 KB wall of
 * Epic view-model booleans in which the visit date appears seven times and the
 * organization's payer-logo token appears once per row; a model reading that
 * spends most of a context window to learn six facts per visit.
 *
 * So the MCPB is a wrapper that condenses. Every capability tool returns the
 * compact shape built here, and `get_raw_data` returns the scraper payload
 * untouched for the cases where a dropped field turns out to matter. Nothing
 * is condensed away permanently — the raw call is one tool call away, and
 * every condensed result that lost anything substantial says so.
 *
 * Two levels, because the payloads fail in two different ways:
 *
 *   - {@link CONDENSERS} — a hand-written condenser for the payloads whose
 *     *shape* is the problem: visits, labs, imaging, billing, messages. These
 *     are raw Epic view models, and no generic rule recovers the six fields
 *     that matter from the two hundred that don't.
 *   - {@link prune} — everything else. Most scrapers already return a tidy
 *     record per row; what they carry is nulls and empty strings for the
 *     fields this patient has nothing in. Dropping those is lossless for a
 *     reader — "absent" and "empty" say the same thing — and it is the safe
 *     default for a capability added to the registry tomorrow, which is why
 *     there is no list here that a new capability could be missing from.
 *
 * Two things `prune` deliberately keeps: `false`/`0`, because "not refillable"
 * and "balance zero" are answers rather than absences, and empty **arrays**,
 * because `allergies: []` is a clinical statement and losing it would leave a
 * model unable to tell "no known allergies" from "we didn't look".
 */

import { visitInstantMs } from '../../scrapers/myChart/chart/visits/visits';

// ── Reading untyped payloads ────────────────────────────────────────────────
//
// Everything below takes `unknown` and never casts to a scraper interface.
// These run against whatever a given Epic release actually sent, not against
// what a type says it sent, so a field an instance omits has to come out as a
// missing key rather than a crash mid-scrape.

function rec(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function bool(value: unknown): boolean {
  return value === true;
}

/** `true`, or undefined so {@link row} drops the key. Flags read as noise when false. */
function flag(value: unknown): true | undefined {
  return value === true ? true : undefined;
}

/**
 * One of Epic's rich-text blobs (`{ isRTF, hasContent, contentAsString, … }`)
 * as plain text. Reads `contentAsString` rather than trusting `hasContent`:
 * an instance that fills the string and leaves the flag false is the case
 * where silently returning '' loses a radiologist's findings.
 */
function richText(value: unknown): string {
  return text(rec(value).contentAsString).trim();
}

/**
 * Assemble a condensed row, dropping every key with nothing in it.
 *
 * Unlike {@link prune} this also drops empty arrays: a hand-written condenser
 * knows the field is a convenience ("other_providers", "diagnoses") rather
 * than a clinical assertion, so an empty one is noise on every row.
 */
function row(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Drop the keys that carry no information: `null`, `undefined`, `''`, and
 * objects that hold nothing but those.
 *
 * Array *elements* are never removed, only pruned in place (an object that
 * empties out stays as `{}`), so a count taken from a pruned list still
 * matches the count MyChart reported.
 */
export function prune(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) =>
      item !== null && typeof item === 'object' ? (prune(item) ?? {}) : item,
    );
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const pruned = prune(child);
      if (pruned === undefined) continue;
      out[key] = pruned;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }
  if (value === null || value === undefined || value === '') return undefined;
  return value;
}

// ── Visits ──────────────────────────────────────────────────────────────────

/**
 * Both visit capabilities return the same `Visit` view model — ~120 fields per
 * row, of which about a dozen describe the visit and the rest describe which
 * buttons MyChart's own web UI would render. This keeps the dozen.
 */
function visitRow(raw: unknown, past: boolean): { ms: number | null; visit: Record<string, unknown> } {
  const visit = rec(raw);
  const ms = visitInstantMs({ Instant: text(visit.Instant), PrimaryDate: text(visit.PrimaryDate) });
  const providers = list(visit.Providers).map((p) => text(rec(p).Name)).filter(Boolean);
  const primary = text(visit.PrimaryProviderName) || text(rec(visit.PrimaryProvider).Name) || providers[0] || '';
  const copay = rec(visit.Copay);

  return {
    ms,
    visit: row({
      // The handle for get_visit_notes / get_visit_avs / get_letter_details.
      // Dropping it would make every follow-up call impossible.
      csn: text(visit.Csn) || text(visit.CsnForECheckIn),
      date: visitDate(visit, ms),
      time: visitTime(visit),
      type: text(visit.VisitTypeName),
      reason: text(visit.ChiefComplaint),
      status: visitStatus(visit, past),
      provider: primary,
      other_providers: providers.filter((name) => name !== primary),
      department: text(rec(visit.PrimaryDepartment).Name),
      organization: text(rec(visit.Organization).OrganizationName),
      diagnoses: list(visit.Diagnoses)
        .map((d) => text(rec(d).Description) || text(rec(d).Code))
        .filter(Boolean),
      procedures: list(visit.SurgicalProcedures).map((p) => text(rec(p).Name)).filter(Boolean),
      duration_minutes: typeof visit.DurationInMinutes === 'number' ? visit.DurationInMinutes : undefined,
      copay_due: bool(copay.IsPaid) ? '' : text(copay.Amount),
      telehealth: flag(rec(visit.Telemedicine).IsTelemedicine),
      notes_available: flag(visit.IsClinicalNoteAvailable),
    }),
  };
}

/**
 * The visit's date as the clinic stated it, normalized to YYYY-MM-DD when
 * MyChart gave a machine-readable one.
 *
 * Deliberately NOT derived from `Instant`. That is an absolute instant, and
 * rendering it in the *reader's* timezone moves an evening appointment to the
 * wrong day — this process runs wherever the patient's laptop is, which is
 * frequently not where the clinic is. `Instant` is used for ordering only,
 * where the offset cancels out.
 */
function visitDate(visit: Record<string, unknown>, ms: number | null): string {
  const primary = text(visit.PrimaryDate).trim();
  const american = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(primary);
  if (american) {
    return `${american[3]}-${american[1]!.padStart(2, '0')}-${american[2]!.padStart(2, '0')}`;
  }
  if (primary) return primary;
  const display = text(visit.Date).trim();
  if (display) return display;
  return ms !== null ? new Date(ms).toISOString().slice(0, 10) : '';
}

/** Same reasoning as {@link visitDate}: MyChart's own rendering, or nothing. */
function visitTime(visit: Record<string, unknown>): string {
  if (bool(visit.IsHideVisitTime) || bool(visit.IsTimeToBeDetermined)) return '';
  const explicit = text(visit.Time).trim();
  if (explicit) return explicit;
  const primary = text(visit.PrimaryDate).trim();
  const separator = primary.indexOf(' ');
  return separator === -1 ? '' : primary.slice(separator + 1).trim();
}

/**
 * One word for the ten booleans MyChart uses to say the same thing. Ordered
 * most-specific first: a cancelled visit is also `IsPastVisit`, and reporting
 * it as "completed" would be a lie about care the patient never received.
 *
 * `past` comes from which capability asked, not from the row. `IsPastVisit` is
 * a rendering hint some instances leave false on rows that LoadPast itself
 * returned, and a visit from 2019 labelled "scheduled" reads as an appointment
 * the patient still has to keep.
 */
function visitStatus(visit: Record<string, unknown>, past: boolean): string {
  if (bool(visit.IsCanceled)) return 'canceled';
  if (bool(visit.IsNoShow)) return 'no_show';
  if (bool(visit.LeftWithoutSeen)) return 'left_without_being_seen';
  if (bool(visit.InProgress)) return 'in_progress';
  if (bool(visit.IsArrived)) return 'arrived';
  if (past || bool(visit.IsPastVisit)) return 'completed';
  if (bool(visit.IsCancelRequestSent)) return 'cancel_requested';
  if (bool(visit.IsConfirmed)) return 'confirmed';
  return 'scheduled';
}

/** `{ visits: [], error }` — the scrape-failed shape. Never condense an error away. */
function isScrapeError(payload: Record<string, unknown>): boolean {
  return typeof payload.error === 'string';
}

function condensePastVisits(raw: unknown): unknown {
  const container = rec(raw);
  if (isScrapeError(container)) return prune(raw);

  const orgs = Object.values(rec(container.List)).map(rec);
  const rows = orgs.flatMap((org) => list(org.List).map((v) => visitRow(v, true)));
  rows.sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0));

  return row({
    count: rows.length,
    // The scraper pages until the requested window is covered; this says
    // whether MyChart still has visits older than that, so "that's all of it"
    // is never inferred from a list that simply stopped.
    has_older_visits: orgs.some((org) => bool(org.HasMoreData)),
    visits: rows.map((r) => r.visit),
  });
}

function condenseUpcomingVisits(raw: unknown): unknown {
  const container = rec(raw);
  if (isScrapeError(container)) return prune(raw);

  const buckets: ReadonlyArray<readonly [string, unknown]> = [
    ['in_progress', container.InProgressVisits],
    ['soon', container.NextNDaysVisits],
    ['later', container.LaterVisitsList],
  ];
  const rows = buckets.flatMap(([bucket, visits]) =>
    list(visits).map((v) => {
      const { ms, visit } = visitRow(v, false);
      return { ms, visit: { ...visit, bucket } };
    }),
  );
  rows.sort((a, b) => (a.ms ?? 0) - (b.ms ?? 0));

  return row({ count: rows.length, visits: rows.map((r) => r.visit) });
}

// ── Lab results ─────────────────────────────────────────────────────────────

/**
 * How many points of a component's trend the condensed view carries. A chart
 * with fifteen years of annual lipid panels turns one order into a few hundred
 * data points, each with its own copy of the reference range; the recent ones
 * are what a reader uses, and `get_raw_data` still has all of them.
 */
const MAX_TREND_POINTS = 8;

function condenseLabResults(raw: unknown): unknown {
  const results = list(raw).flatMap((rawOrder) => {
    const order = rec(rawOrder);
    const history = rec(rec(order.historicalResults).historicalResults);
    return list(order.results).map((result) => labResultRow(text(order.orderName), result, history));
  });
  return row({ count: results.length, results });
}

function labResultRow(
  orderName: string,
  raw: unknown,
  history: Record<string, unknown>,
): Record<string, unknown> {
  const result = rec(raw);
  const meta = rec(result.orderMetadata);
  const study = rec(result.studyResult);

  return row({
    name: text(result.name) || orderName,
    date: text(meta.prioritizedInstantISO) || text(meta.resultTimestampDisplay),
    collected: text(meta.collectionTimestampsDisplay),
    status: text(meta.resultStatus),
    abnormal: flag(result.isAbnormal),
    ordered_by: text(meta.orderProviderName) || text(meta.authorizingProviderName),
    specimen: text(meta.specimensDisplay),
    lab: text(rec(meta.resultingLab).name),
    components: list(result.resultComponents).map((c) => componentRow(c, history)),
    findings: richText(study.narrative),
    impression: richText(study.impression),
    note: richText(result.resultNote),
    letter: richText(result.resultLetter),
  });
}

function componentRow(raw: unknown, history: Record<string, unknown>): Record<string, unknown> {
  const component = rec(raw);
  const info = rec(component.componentInfo);
  const value = rec(component.componentResultInfo);
  // Sorted here rather than trusted: Epic's ordering of this array is not
  // guaranteed across releases, and taking the tail of a newest-first list
  // would hand a reader the eight OLDEST values under a "recent trend" reading.
  const trend = list(rec(history[text(info.componentID)]).historicalResultData)
    .map((point) => rec(point))
    .filter((point) => text(point.dateISO) && text(point.value))
    .sort((a, b) => text(a.dateISO).localeCompare(text(b.dateISO)))
    .slice(-MAX_TREND_POINTS)
    .map((point) => `${text(point.dateISO).slice(0, 10)}: ${text(point.value)}`);

  return row({
    name: text(info.name) || text(info.commonName),
    value: text(value.value),
    units: text(info.units),
    range: text(rec(value.referenceRange).formattedReferenceRange),
    flag: abnormalFlag(value.abnormalFlagCategoryValue),
    comment: richText(component.componentComments),
    trend,
  });
}

/**
 * Epic spells "nothing to flag" several ways and encodes the real flags
 * differently per release. Anything that isn't one of the known no-ops is
 * passed through verbatim rather than mapped: inventing a label for a code we
 * have not captured is how "Critical" becomes "abnormal" on a chart where it
 * meant something else. The result-level `abnormal` flag and the printed
 * reference range are the signals a reader should rely on.
 */
function abnormalFlag(value: unknown): string {
  if (typeof value === 'number') return value === 0 ? '' : String(value);
  const label = text(value).trim();
  return /^(unknown|none|normal)$/i.test(label) ? '' : label;
}

// ── Imaging ─────────────────────────────────────────────────────────────────

function condenseImaging(raw: unknown): unknown {
  const studies = list(raw).map((rawStudy) => {
    const study = rec(rawStudy);
    const result = rec(list(study.results)[0]);
    const meta = rec(result.orderMetadata);
    const imageId = text(study.image_id);

    return row({
      // Both handles for download_imaging_study; index is its fallback when a
      // model garbles the opaque token.
      index: typeof study.index === 'number' ? study.index : undefined,
      image_id: imageId,
      name: text(study.orderName) || text(result.name),
      date: text(study.resultDate) || text(meta.prioritizedInstantISO),
      status: text(meta.resultStatus),
      ordered_by: text(study.orderProvider) || text(meta.orderProviderName),
      read_by: text(meta.readingProviderName),
      impression: text(study.impression).trim() || richText(rec(result.studyResult).impression),
      findings: text(study.narrative).trim() || richText(rec(result.studyResult).narrative),
      series: list(study.series).map((s) => {
        const series = rec(s);
        return row({
          description: text(series.studyDescription),
          modality: text(series.modality),
          images: typeof series.numberOfImages === 'number' ? series.numberOfImages : undefined,
        });
      }),
      // Said explicitly, because "no image_id" is the difference between a
      // report you can read and pictures you can look at.
      has_viewable_images: imageId ? true : false,
    });
  });
  return row({ count: studies.length, studies });
}

// ── Billing ─────────────────────────────────────────────────────────────────

/**
 * The billing lists worth merging, and what each says about the rows in it.
 *
 * MyChart returns a dozen `*VisitList` arrays that overlap: `UnifiedVisitList`
 * is the modern combined one, the legacy releases split the same charges
 * across the categorized lists, and a couple more (`NotPaymentPlanVisitList`,
 * `VisitAutoPayVisitList`) are filtered *views* of rows already in the others.
 * Reading only the first non-empty one loses a patient's charges on whichever
 * release does not populate it; reading all of them double-counts. So the
 * views are left out, the rest are merged, and duplicates are dropped by
 * {@link billingVisitKey}.
 */
const BILLING_VISIT_LISTS: ReadonlyArray<readonly [string, string]> = [
  ['UnifiedVisitList', ''],
  ['VisitList', ''],
  ['InformationalVisitList', 'informational'],
  ['NoBalanceVisitList', 'no_balance'],
  ['BadDebtVisitList', 'bad_debt'],
  ['PaymentPlanVisitList', 'payment_plan'],
  ['AdvanceBillVisitList', 'advance_bill'],
  ['ContestedVisitList', 'contested'],
  ['AdjustmentVisitList', 'adjustment'],
];

/** Identity of one charge across the lists it appears in. */
function billingVisitKey(visit: Record<string, unknown>): string {
  return [visit.HospitalAccountId, visit.StartDate, visit.Description, visit.SelfAmountDueRaw]
    .map((value) => (typeof value === 'string' || typeof value === 'number' ? String(value) : ''))
    .join('|');
}

function condenseBilling(raw: unknown): unknown {
  const accounts = list(raw).map((rawAccount) => {
    const account = rec(rawAccount);
    const data = rec(rec(account.billingDetails).Data);
    const statements = rec(rec(account.statementList).DataStatement);
    const detailBills = rec(rec(account.statementList).DataDetailBill);

    const seen = new Set<string>();
    const visits: Record<string, unknown>[] = [];
    for (const [listName, category] of BILLING_VISIT_LISTS) {
      for (const rawVisit of list(data[listName])) {
        const visit = rec(rawVisit);
        const key = billingVisitKey(visit);
        if (seen.has(key)) continue;
        seen.add(key);
        visits.push(row({ ...billingVisitRow(visit), category }));
      }
    }

    return row({
      patient: text(account.patientName),
      guarantor: text(account.guarantorNumber),
      amount_due: typeof account.amountDue === 'number' ? account.amountDue : undefined,
      can_pay_online: flag(data.CanMakePayment),
      visits,
      statements: [...list(statements.StatementList), ...list(detailBills.StatementList)].map(statementRow),
      payments: list(rec(rec(account.paymentList).Data).PaymentList).map(paymentRow),
    });
  });

  const owed = list(raw)
    .map((a) => rec(a).amountDue)
    .filter((v): v is number => typeof v === 'number');

  return row({
    count: accounts.length,
    total_due: owed.length ? owed.reduce((sum, v) => sum + v, 0) : undefined,
    accounts,
  });
}

function billingVisitRow(raw: unknown): Record<string, unknown> {
  const visit = rec(raw);
  return row({
    date: text(visit.StartDateDisplay) || text(visit.DateRangeDisplay),
    description: text(visit.Description),
    patient: text(visit.Patient),
    provider: text(visit.Provider),
    charges: text(visit.ChargeAmount),
    insurance_paid: text(visit.InsurancePaymentAmount),
    insurance_owes: text(visit.InsuranceAmountDue),
    you_paid: text(visit.SelfPaymentAmount),
    you_owe: text(visit.SelfAmountDue),
    primary_payer: text(visit.PrimaryPayer),
    account: text(visit.HospitalAccountDisplay),
  });
}

function statementRow(raw: unknown): Record<string, unknown> {
  const statement = rec(raw);
  return row({
    date: text(statement.FormattedDateDisplay) || text(statement.DateDisplay),
    description: text(statement.Description),
    amount: text(statement.StatementAmountDisplay),
    unread: flag(statement.IsRead === false),
  });
}

function paymentRow(raw: unknown): Record<string, unknown> {
  const payment = rec(raw);
  return row({
    date: text(payment.FormattedDateDisplay),
    description: text(payment.Description),
    amount: text(payment.PaymentAmountDisplay),
  });
}

// ── Messages ────────────────────────────────────────────────────────────────

function condenseMessages(raw: unknown): unknown {
  const inbox = rec(raw);
  const entries = list(inbox.conversations).length ? list(inbox.conversations) : list(inbox.threads);

  const conversations = entries.map((rawConversation) => {
    const conversation = rec(rawConversation);
    const messages = list(conversation.messages).map((rawMessage) => {
      const message = rec(rawMessage);
      const attachments = list(message.attachments).length;
      return row({
        from: text(rec(message.author).displayName),
        date: text(message.deliveryInstantISO),
        unread: flag(message.isUnread),
        body: text(message.body).trim(),
        attachments: attachments || undefined,
      });
    });

    return row({
      // The handle for get_message_thread, send_reply and delete_message.
      conversation_id: text(conversation.hthId),
      subject: text(conversation.subject),
      with: list(conversation.audience).map((a) => text(rec(a).name)).filter(Boolean),
      unread: flag(rec(conversation.tags).Unread),
      urgent: flag(conversation.hasUrgentMsgs),
      message_count: messages.length || undefined,
      has_more_messages: flag(conversation.hasMoreMessages),
      messages,
      // The preview is a truncated copy of a message body — worth keeping only
      // when the bodies themselves did not come down with the list.
      preview: messages.length ? '' : text(conversation.previewText),
    });
  });

  return row({
    count: conversations.length,
    unread_count:
      typeof inbox.legacyXUnreadCount === 'number' ? inbox.legacyXUnreadCount : undefined,
    conversations,
  });
}

function condenseMessageRecipients(raw: unknown): unknown {
  const recipients = list(rec(raw).recipients).map((rawRecipient) => {
    const recipient = rec(rawRecipient);
    return row({
      // send_message resolves a recipient by this name, so the ids beside it
      // are plumbing no caller ever passes back.
      name: text(recipient.displayName),
      specialty: text(recipient.specialty),
      relationship: text(recipient.pcpTypeDisplayName),
    });
  });
  return row({ count: recipients.length, recipients });
}

// ── The registry ────────────────────────────────────────────────────────────

/**
 * Capability id → condenser. Anything absent falls through to {@link prune},
 * which is why nothing here needs a matching "deliberately unhandled" list to
 * fall out of date.
 */
export const CONDENSERS: Readonly<Record<string, (raw: unknown) => unknown>> = {
  get_past_visits: condensePastVisits,
  get_upcoming_visits: condenseUpcomingVisits,
  get_lab_results: condenseLabResults,
  get_imaging_results: condenseImaging,
  get_billing: condenseBilling,
  get_messages: condenseMessages,
  get_message_recipients: condenseMessageRecipients,
};

export interface CondensedResult {
  /** What the tool returns to the model. */
  data: unknown;
  /** True when a hand-written condenser ran, so the caller can point at `get_raw_data`. */
  reshaped: boolean;
}

/**
 * The model-facing rendering of one capability's payload.
 *
 * A payload that prunes to nothing comes back as `{}` (or `[]`) rather than
 * `undefined`: the tool result is JSON, and "the account has none of these" has
 * to survive serialization.
 */
export function condenseForModel(capabilityId: string, raw: unknown): CondensedResult {
  const condenser = CONDENSERS[capabilityId];
  if (condenser) return { data: condenser(raw), reshaped: true };
  return { data: prune(raw) ?? (Array.isArray(raw) ? [] : {}), reshaped: false };
}
