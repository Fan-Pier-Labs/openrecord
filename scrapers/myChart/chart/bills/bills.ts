import { makeAuthenticatedRequest, SessionExpiredError } from '../../core/makeAuthenticatedRequest';
import type { MyChartRequest } from '../../core/myChartRequest';
import { RawCollector, type RawResponse } from '../../core/rawResponse';
import { getRequestVerificationTokenFromBody } from '../../core/util';
import { list, rec, text } from '../../processors/read';
import { subYears, addYears } from 'date-fns';
import type { BillingAccount, PaymentListResponse, StatementItem, StatementListResponse } from './types';
import { logger } from '../../../../shared/logger';
import { toEpicDteLocal } from '../../../../shared/epicDate';
import type { FilePayload } from '../../../../shared/capabilities/types';
import { safeFileName } from '../../core/safeFileName';
import { parseBillingAccountsHtml } from './summaryHtml';
import { VISIT_LIST_CATEGORIES, billingProcessor, isStubRow, statementDateISO, type BillingStandard } from './bills.processor';

export { parsePaymentUrl, parseBillingAccountsHtml, parseAmount } from './summaryHtml';
export type {
  BillingStandard,
  BillingAccountStandard,
  BillingVisitStandard,
  BillingVisitCategory,
  BillingStatementStandard,
  BillingPaymentStandard,
  BillingProcedureStandard,
  BillingProcedureGroupStandard,
  BillingCoverageInfoStandard,
} from './bills.processor';
export { billingProcessor, mergeVisitLists, VISIT_LIST_CATEGORIES, BillingNotFullyLoadedError } from './bills.processor';

// Two jobs live here: the `get_billing` read (fetchBillingRaw + the
// processor) and the `download_billing_statement` file download, which
// re-walks the summary and statement lists to find the one statement asked for.

function accountQuery(account: BillingAccount): string {
  return `id=${account.id}&context=${account.context}`;
}

/** A window wide enough to cover a lifetime of visits; the search is bounded by explicit dates. */
function visitsPath(account: BillingAccount): string {
  const date100YearsAgo = subYears(new Date(), 100);
  const date1YearFromNow = addYears(new Date(), 1);
  return `/Billing/Details/GetVisits?noCache=${Math.random()}&${accountQuery(account)}&filterOption=1&searchStartDTE=${toEpicDteLocal(date100YearsAgo)}&searchStopDTE=${toEpicDteLocal(date1YearFromNow)}&cid=`;
}

function paymentListPath(account: BillingAccount): string {
  return `/Billing/Details/LoadPaymentList?noCache=${Math.random()}&${accountQuery(account)}&searchStartDTE=&searchEndDTE=&cid=`;
}

function statementListPath(account: BillingAccount): string {
  return `/Billing/Details/GetStatementList?noCache=${Math.random()}&${accountQuery(account)}&cid=`;
}

function detailsPagePath(account: BillingAccount): string {
  return `/Billing/Details?ID=${account.id}&Context=${account.context}`;
}

export const GET_MORE_VISITS_PATH = '/Billing/Details/GetMoreVisits';

/**
 * The hydrate key for one stub, in the three shapes Epic's own client builds
 * (`AccountDetailsController.__processSingleListResponse`): a hospital
 * account, a hospital account billed under a specific provider, or a
 * standalone estimate.
 */
type HydrateKey = { EncAccountID: string } & Record<string, string>;

function hydrateKey(row: Record<string, unknown>): HydrateKey | null {
  const har = text(row.HospitalAccountId);
  const estimate = text(row.EmptyVisitEstimateID);
  if (!har && estimate) return { EncAccountID: estimate, IsPes: 'true', IsHar: 'false' };
  if (!har) return null;
  const provider = text(row.ProviderId);
  return provider
    ? { EncAccountID: har, IsPes: 'false', IsHar: 'true', EncPBSerID: provider }
    : { EncAccountID: har, IsPes: 'false', IsHar: 'true' };
}

/**
 * `listOfAccounts` as ASP.NET model binding wants it —
 * `listOfAccounts[0].EncAccountID=…&listOfAccounts[0].IsHar=true&…` — which
 * is the encoding captured off the real request, not an inference.
 */
function moreVisitsBody(account: BillingAccount, keys: HydrateKey[]): string {
  const params = new URLSearchParams({ id: account.id ?? '', context: account.context ?? '' });
  keys.forEach((key, i) => {
    for (const [field, value] of Object.entries(key)) params.append(`listOfAccounts[${i}].${field}`, value);
  });
  return params.toString();
}

/**
 * Hydrate every stub in a `GetVisits` body, in as few requests as MyChart
 * allows.
 *
 * Epic's "Load all accounts" button posts every outstanding stub at once, and
 * a 25-stub account came back in a single response — but its own client
 * re-checks how many rows actually arrived and only advances by that many, so
 * the server is free to cap a batch. This loops on what is still missing
 * rather than assuming one round trip, and stops making progress rather than
 * spinning if a batch comes back with nothing new.
 *
 * The answer pairs with the request POSITIONALLY, and cannot be joined on
 * anything else: a stub's `HospitalAccountId` is an encrypted handle, its
 * hydrated row's is the plain account number, and no field on the hydrated
 * row carries the handle back. Epic's own client relies on the same
 * correspondence, advancing its cursor by however many rows came back — which
 * is why a capped batch has to be re-asked for by trimming from the front,
 * not by looking up what is missing.
 *
 * Best-effort here, but not silently: the processor throws if any row is
 * still a stub once the answers are merged, because a stub's fabricated
 * `"$0.00"` is indistinguishable from a settled visit.
 */
async function hydrateStubs(
  collector: RawCollector,
  account: BillingAccount,
  visitsBody: unknown,
  token: string | undefined,
): Promise<void> {
  const data = rec(rec(visitsBody).Data);
  const byHandle = new Map<string, HydrateKey>();
  for (const category of VISIT_LIST_CATEGORIES) {
    for (const row of list(data[category])) {
      if (!isStubRow(row)) continue;
      const key = hydrateKey(rec(row));
      if (key) byHandle.set(key.EncAccountID, key);
    }
  }
  let pending = [...byHandle.values()];
  if (pending.length === 0) return;
  if (!token) {
    logger.debug(`Billing: ${pending.length} unhydrated charge rows but no antiforgery token; leaving them.`);
    return;
  }

  // The list can only shrink; the guard is against a batch that returns
  // nothing, which would otherwise loop forever.
  while (pending.length > 0) {
    const { body, failure } = await collector.send(
      {
        path: `${GET_MORE_VISITS_PATH}?noCache=${Math.random()}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          __RequestVerificationToken: token,
        },
        body: moreVisitsBody(account, pending),
      },
      { tolerateFailure: true },
    );
    if (failure) {
      logger.debug(`Billing: GetMoreVisits failed for ${account.guarantorNumber}: ${failure.message}`);
      return;
    }
    // Only rows that actually came back hydrated count as progress; a server
    // that echoes the stubs would otherwise look like a full answer.
    const rows = list(rec(rec(body).Data).UnifiedVisitList);
    const hydrated = rows.filter((row) => !isStubRow(row)).length;
    if (hydrated === 0) {
      logger.debug(`Billing: GetMoreVisits returned no hydrated rows; ${pending.length} left unhydrated.`);
      return;
    }
    pending = pending.slice(rows.length);
  }
}

/**
 * `GET /Billing/Summary`, then per account the details page, `GetVisits`,
 * however many `GetMoreVisits` calls it takes to fill in the lazy-loaded
 * rows, `GetStatementList` and `LoadPaymentList`.
 *
 * The details page is fetched *first* because it carries both the `EncID` the
 * statement download needs and the antiforgery token `GetMoreVisits` requires.
 * The summary is parsed here only to learn which accounts to fetch; the
 * processor re-parses the recorded page to build the account rows.
 *
 * The supplementary calls are best-effort — a statement-list outage should
 * not cost the caller the charge history — and a non-OK response is still
 * recorded. The summary and the visit list are the payload: a failure there
 * throws.
 */
export async function fetchBillingRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const summary = await collector.send({ path: '/Billing/Summary' });

  for (const account of parseBillingAccountsHtml(summary.text, mychartRequest.hostname)) {
    let token: string | undefined;
    try {
      const details = await collector.send({ path: detailsPagePath(account) }, { tolerateFailure: true });
      token = getRequestVerificationTokenFromBody(details.text);
    } catch (err) {
      if (err instanceof SessionExpiredError) throw err;
      logger.debug('Failed to fetch billing details page:', (err as Error).message);
    }

    const visits = await collector.send({ path: visitsPath(account) });
    try {
      await hydrateStubs(collector, account, visits.body, token);
    } catch (err) {
      if (err instanceof SessionExpiredError) throw err;
      logger.debug('Failed to hydrate billing charge rows:', (err as Error).message);
    }

    for (const path of [statementListPath(account), paymentListPath(account)]) {
      try {
        await collector.send({ path }, { tolerateFailure: true });
      } catch (err) {
        if (err instanceof SessionExpiredError) throw err;
        logger.debug('Failed to fetch billing details:', (err as Error).message);
      }
    }
  }

  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function getBillingHistory(mychartRequest: MyChartRequest): Promise<BillingStandard> {
  return billingProcessor.standard(await fetchBillingRaw(mychartRequest));
}

export async function getPaymentList(mychartRequest: MyChartRequest, billingAccount: BillingAccount): Promise<PaymentListResponse> {
  const paymentListResponse = await makeAuthenticatedRequest(mychartRequest, { path: paymentListPath(billingAccount) });
  return await paymentListResponse.json() as PaymentListResponse;
}

export async function getStatementList(mychartRequest: MyChartRequest, billingAccount: BillingAccount): Promise<StatementListResponse> {
  const statementsResponse = await makeAuthenticatedRequest(mychartRequest, { path: statementListPath(billingAccount) });
  return await statementsResponse.json() as StatementListResponse;
}

export async function getEncBillingId(mychartRequest: MyChartRequest, billingAccount: BillingAccount) {
  const res = await makeAuthenticatedRequest(mychartRequest, { path: detailsPagePath(billingAccount) });
  const body = await res.text();
  const match = /EncID"\s*:\s*"([^"]*)"/.exec(body);
  if (!match) {
    logger.debug('unable to find end id');
  }
  return match?.[1];
}

export async function saveStatementPdf(mychartRequest: MyChartRequest, encId: string, statement: StatementItem) {
  const path = `/Billing/Details/DownloadFromBlob/?type=1&id=${statement.RecordID}&earId=${encId}&billSys=${statement.EncBillingSystem}&fileKey=${statement.ImagePath}&token=${encodeURIComponent(statement.Token)}&fileName=Statement_${statement.DateDisplay}&DocExt=PDF&PesId=&cid=`;

  const statementPdf = await makeAuthenticatedRequest(mychartRequest, { path: path });
  const pdfArrayBuffer = await statementPdf.arrayBuffer();

  // Convert ArrayBuffer to a Node.js Buffer
  return Buffer.from(pdfArrayBuffer);
}

/** What `download_billing_statement` returns: the PDF plus the statement it is. */
export interface BillingStatementPdf extends FilePayload {
  statement: {
    RecordID: string;
    dateISO: string | null;
    FormattedDateDisplay: string | null;
    Description: string | null;
    StatementAmountDisplay: string | null;
    IsDetailBill: boolean | null;
  };
}

/**
 * Find the statement whose `RecordID` a caller copied out of `get_billing`,
 * and which guarantor account it belongs to. Both lists are searched, because
 * the itemized bills (`DataDetailBill`) download the same way as statements.
 */
async function findStatement(
  mychartRequest: MyChartRequest,
  recordId: string,
): Promise<{ account: BillingAccount; statement: StatementItem }> {
  const summary = await makeAuthenticatedRequest(mychartRequest, { path: '/Billing/Summary' });
  const accounts = parseBillingAccountsHtml(await summary.text(), mychartRequest.hostname);
  const seen: string[] = [];
  for (const account of accounts) {
    const statementList = await getStatementList(mychartRequest, account);
    const statements = [
      ...(statementList.DataStatement?.StatementList ?? []),
      ...(statementList.DataDetailBill?.StatementList ?? []),
    ];
    const statement = statements.find((s) => s.RecordID === recordId);
    if (statement) return { account, statement };
    const ids = statements.map((s) => s.RecordID).filter(Boolean);
    if (ids.length) seen.push(`account ${account.guarantorNumber}: ${ids.join(', ')}`);
  }
  throw new Error(
    `No billing statement has RecordID "${recordId}". get_billing lists each statement's RecordID; ` +
      (seen.length ? `the statements on this login are — ${seen.join('; ')}.` : 'this login has no statements on any account.'),
  );
}

/**
 * One statement or itemized bill as the PDF MyChart serves for it.
 *
 * The bytes are checked for the `%PDF` signature rather than trusted: a
 * stale token or a bad `EncID` comes back from `DownloadFromBlob` as an HTML
 * error page with status 200, and handing that to a caller as a `.pdf` is the
 * silent failure this exists to prevent.
 */
export async function downloadBillingStatement(
  mychartRequest: MyChartRequest,
  recordId: string,
): Promise<BillingStatementPdf> {
  const { account, statement } = await findStatement(mychartRequest, recordId);
  const encId = await getEncBillingId(mychartRequest, account);
  if (!encId) {
    throw new Error(
      `MyChart's billing details page for account ${account.guarantorNumber} carried no EncID, which the statement download needs.`,
    );
  }
  const bytes = await saveStatementPdf(mychartRequest, encId, statement);
  if (bytes.subarray(0, 4).toString() !== '%PDF') {
    throw new Error(
      `MyChart did not return a PDF for statement ${recordId} (${bytes.length} bytes, starting "${bytes.subarray(0, 40).toString().replace(/\s+/g, ' ')}").`,
    );
  }
  return {
    fileName: safeFileName(`Statement_${statement.DateDisplay || recordId}.pdf`, 'statement.pdf'),
    mimeType: 'application/pdf',
    bytes,
    statement: {
      RecordID: statement.RecordID,
      dateISO: statementDateISO(statement.DateDisplay),
      FormattedDateDisplay: statement.FormattedDateDisplay ?? null,
      Description: statement.Description ?? null,
      StatementAmountDisplay: statement.StatementAmountDisplay ?? null,
      IsDetailBill: statement.IsDetailBill ?? null,
    },
  };
}
