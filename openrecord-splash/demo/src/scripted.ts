/**
 * Offline fallback for the demo agent.
 *
 * When the AI proxy is unreachable, rate-limited, or simply not configured for
 * a local checkout, the demo still has to work — a landing-page demo that shows
 * an error banner is worse than no demo. This module matches the user's message
 * against a keyword table, runs the *same real tool calls* the model would have
 * run, and renders the *same real data* the tools return.
 *
 * The tool calls and the numbers are genuine; only the choice of words is
 * pre-written. `usedFallback` is surfaced in the UI so nobody is misled about
 * which engine answered.
 */

import { SKILLS } from './skills';
import type * as DemoData from './data';
import type {
  AppointmentOffer,
  BillingCharge,
  Conversation,
  EmergencyContact,
  LabPanel,
  Medication,
  ParsedToolCall,
  ToolRecord,
} from './types';

const fmt = {
  /** "$2,760.00" → 2760 */
  money(value: string): number {
    return Number(String(value).replace(/[^0-9.]/g, '')) || 0;
  },
  usd(n: number): string {
    return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  },
};

type LabPage = { total: number; results: LabPanel[] };

type FlaggedComponent = {
  component: string;
  value: string;
  units: string;
  referenceRange: string;
  flag: string;
  testName: string;
  collectedDate: string;
};

/** Pull every flagged component out of a lab-results payload. */
function abnormalComponents(labPayload: LabPage): FlaggedComponent[] {
  const out: FlaggedComponent[] = [];
  for (const test of labPayload.results ?? []) {
    for (const c of test.results ?? []) {
      if (c.flag && c.flag !== 'Normal') {
        out.push({ ...c, testName: test.testName, collectedDate: test.collectedDate });
      }
    }
  }
  return out;
}


/* ------------------------------------------------------------------ *
 * Payload shapes
 *
 * Derived from the data module with `typeof` so they can't drift from the
 * fixture. `payload()` narrows one tool record to the shape its rule expects
 * — the rule chose the tool, so it knows what came back.
 * ------------------------------------------------------------------ */

type Profile = typeof DemoData.profile;
type HealthSummary = typeof DemoData.healthSummary;
type Allergy = (typeof DemoData.allergies)[number];
type HealthIssue = (typeof DemoData.healthIssues)[number];
type PreventiveItem = (typeof DemoData.preventiveCare)[number];
type Immunization = (typeof DemoData.immunizations)[number];
type CareTeamMember = (typeof DemoData.careTeam)[number];
type VitalsEntry = (typeof DemoData.vitals)[number];
type PastVisit = (typeof DemoData.pastVisits)[number];
type Letter = (typeof DemoData.letters)[number];
type ImagingStudy = (typeof DemoData.imagingResults)[number];
type Insurance = (typeof DemoData.insurance)[number];
type MessageRecipients = typeof DemoData.messageRecipients;
type Visit = (typeof DemoData.upcomingVisits)[number];

type BillingPage = { totalVisits: number; visits: BillingCharge[] };
type MessagePage = { total: number; conversations: Conversation[] };
type ImagingPage = { total: number; results: ImagingStudy[] };

function payload<T>(record: ToolRecord): T {
  return record.result as T;
}

type Rule = {
  id: string;
  match: (text: string) => boolean;
  tools: ParsedToolCall[];
  render: (records: ToolRecord[]) => string;
};

/**
 * Rules are checked in order; the first whose `match` returns true wins.
 * `tools` is the batch to run (exactly what the model would emit), and
 * `render` turns the real results into the reply.
 *
 * Keyword note: spell plurals out (`medications?`) rather than dropping the
 * trailing `\b`. A bare stem with no boundary silently matches inside longer
 * words — "note" inside "nothing", "scan" inside "scandal" — and routes the
 * visitor somewhere baffling.
 */
const RULES: Rule[] = [
  {
    id: 'medications',
    match: (t: string) => /\b(medications?|meds|prescriptions?|pills?|what am i taking|drugs?)\b/.test(t) && !/refill/.test(t),
    tools: [{ tool: 'get_medications', args: {} }],
    render: (records) => {
      const meds = payload<Medication[]>(records[0]);
      const lines = ['## Current Medications', ''];
      for (const m of meds) {
        lines.push(`**${m.name}**`);
        lines.push(m.directions);
        lines.push(`Prescriber: ${m.prescriber} · ${m.pharmacy}`);
        lines.push(
          m.refillsRemaining === 0
            ? '⚠️ No refills remaining — needs a new prescription'
            : `${m.refillsRemaining} refill${m.refillsRemaining === 1 ? '' : 's'} remaining · last filled ${m.lastFilled}`
        );
        lines.push('');
      }
      const dry = meds.filter((m) => m.refillsRemaining === 0);
      if (dry.length) {
        lines.push(
          `${dry.map((m) => m.name).join(' and ')} ${dry.length === 1 ? 'has' : 'have'} no refills left. Want me to draft a message to Dr. Hibbert asking for a new prescription?`
        );
      }
      return lines.join('\n');
    },
  },

  {
    id: 'refill',
    match: (t: string) => /\brefills?\b/.test(t),
    tools: [{ tool: 'get_medications', args: {} }],
    render: (records) => {
      const meds = payload<Medication[]>(records[0]);
      const refillable = meds.filter((m) => m.refillsRemaining > 0);
      const dry = meds.filter((m) => m.refillsRemaining === 0);
      const lines = ['Here is what I can refill right now:', ''];
      for (const m of refillable) {
        lines.push(`**${m.name}** — ${m.refillsRemaining} refill${m.refillsRemaining === 1 ? '' : 's'} left at ${m.pharmacy}`);
      }
      lines.push('');
      if (dry.length) {
        lines.push(
          `${dry.map((m) => m.name).join(', ')} ${dry.length === 1 ? 'has' : 'have'} no refills remaining — those need a new prescription from Dr. Hibbert rather than a refill request.`
        );
        lines.push('');
      }
      lines.push('Tell me which one and I will submit it. I will show you the exact request before it goes out.');
      return lines.join('\n');
    },
  },

  {
    id: 'labs',
    match: (t: string) =>
      /\b(labs?|blood work|bloodwork|cholesterol|a1c|hba1c|glucose|liver|ldl|hdl|triglycerides?|ferritin|iron|results?|out of range)\b/.test(t),
    tools: [{ tool: 'get_lab_results', args: { limit: 20 } }],
    render: (records) => {
      const labs = payload<LabPage>(records[0]);
      const abnormal = abnormalComponents(labs);
      const byName = new Map<string, FlaggedComponent[]>();
      for (const c of abnormal) {
        const bucket = byName.get(c.component) ?? [];
        bucket.push(c);
        byName.set(c.component, bucket);
      }
      const lines = [`## Lab results`, '', `${labs.total} panels on file. ${abnormal.length} flagged values across them.`, '', '## Out of range', ''];
      for (const [component, entries] of byName) {
        const sorted = [...entries].sort((a, b) => b.collectedDate.localeCompare(a.collectedDate));
        const latest = sorted[0];
        lines.push(`**${component}** — ${latest.value} ${latest.units} (${latest.flag}, range ${latest.referenceRange})`);
        if (sorted.length > 1) {
          lines.push(`Trend: ${sorted.map((e) => `${e.value} on ${e.collectedDate}`).reverse().join(' → ')}`);
        } else {
          lines.push(`Collected ${latest.collectedDate}`);
        }
        lines.push('');
      }
      lines.push('The repeat values matter more than any single draw — those are the ones worth raising at your March 25 follow-up.');
      return lines.join('\n');
    },
  },

  {
    id: 'imaging',
    match: (t: string) => /\b(x-?rays?|imaging|radiology|scans?|picture of my)\b/.test(t),
    tools: [{ tool: 'get_imaging_results', args: {} }, { tool: 'get_xray_image', args: { imaging_index: 0 } }],
    render: (records) => {
      const imaging = payload<ImagingPage>(records[0]);
      const study = imaging.results[0];
      return [
        `## ${study.study}`,
        '',
        `${study.date} · ordered by ${study.orderedBy} · ${study.facility}`,
        '',
        '[image:xray]',
        '',
        '**Impression**',
        study.impression,
        '',
        'In plain terms: the lungs look clear, but the heart measured slightly larger than expected, and the radiologist suggested an echocardiogram to look at that properly. Worth asking whether that echo was ever ordered.',
      ].join('\n');
    },
  },

  {
    id: 'billing',
    match: (t: string) => /\b(bill|billing|charge|owe|balance|cost|payment|itemi)/.test(t),
    tools: [{ tool: 'get_billing', args: { limit: 20 } }, { tool: 'get_insurance', args: {} }],
    render: (records) => {
      const billing = payload<BillingPage>(records[0]);
      const insurance = payload<Insurance[]>(records[1]);
      const visits = billing.visits;
      const owed = visits.filter((v) => v.status !== 'Paid');
      const totalOwed = owed.reduce((sum, v) => sum + fmt.money(v.patientResponsibility), 0);
      const lines = ['## Billing', '', `${visits.length} charges on file. ${fmt.usd(totalOwed)} still outstanding across ${owed.length}.`, '', '## Unpaid', ''];
      for (const v of owed) {
        lines.push(`**${v.description}** — ${v.patientResponsibility}`);
        lines.push(`${v.date} · ${v.provider} · ${v.status}`);
        lines.push(`Billed ${v.totalCharge}, insurance covered ${v.insurancePaid}`);
        lines.push('');
      }
      const plan = insurance[0];
      lines.push(`You are on the ${plan.plan} (${plan.deductible} deductible, ${plan.outOfPocketMax} out-of-pocket max).`);
      lines.push('');
      lines.push('Want me to ask Patient Accounts for an itemized statement on any of these? I will show you the message first.');
      return lines.join('\n');
    },
  },

  {
    id: 'appointments',
    // "visit" alone would swallow "tell me about my past visits", which the
    // history rule further down handles properly.
    match: (t: string) =>
      /\b(appointments?|schedule|scheduling|book|visits?|see the doctor|slots?)\b/.test(t) &&
      !/\b(past|previous|history|last time)\b/.test(t),
    tools: [{ tool: 'get_upcoming_visits', args: {} }, { tool: 'get_available_appointments', args: {} }],
    render: (records) => {
      const upcoming = payload<Visit[]>(records[0]);
      const available = payload<AppointmentOffer[] | { error: string }>(records[1]);
      const lines = ['## Already scheduled', ''];
      for (const v of upcoming) {
        lines.push(`**${v.type}** — ${v.date} at ${v.time}`);
        lines.push(`${v.provider} · ${v.department}`);
        lines.push(v.location);
        if (v.instructions) lines.push(`⚠️ ${v.instructions}`);
        lines.push('');
      }
      if (!Array.isArray(available)) {
        // No slots matched the filter — the tool returns an error string.
        lines.push(available.error);
        return lines.join('\n');
      }
      lines.push('## Open slots', '');
      for (const provider of available) {
        lines.push(`**${provider.provider}** — ${provider.visitType}`);
        for (const slot of provider.slots) {
          lines.push(`${slot.date} at ${slot.time}  \`${slot.slotId}\``);
        }
        lines.push('');
      }
      lines.push('Tell me which slot you want and I will book it — I will confirm the details with you before it goes through.');
      return lines.join('\n');
    },
  },

  {
    id: 'messages',
    match: (t: string) => /\b(messages?|inbox|conversations?|doctor said|hear back|repl(y|ies))\b/.test(t),
    tools: [{ tool: 'get_messages', args: { limit: 10 } }],
    render: (records) => {
      const messages = payload<MessagePage>(records[0]);
      const lines = ['## Messages', ''];
      for (const thread of messages.conversations) {
        lines.push(`**${thread.subject}**`);
        lines.push(`${thread.from} · ${thread.date} · ${thread.messages.length} message${thread.messages.length === 1 ? '' : 's'}`);
        lines.push(thread.preview);
        lines.push('');
      }
      lines.push('I can reply to any of these, or start a new thread with anyone on your care team. Just say the word.');
      return lines.join('\n');
    },
  },

  {
    id: 'preventive',
    match: (t: string) => /\b(overdue|due|screenings?|preventive|preventative|colonoscopy|checkups?|check-ups?)\b/.test(t),
    tools: [{ tool: 'get_preventive_care', args: {} }, { tool: 'get_immunizations', args: {} }],
    render: (records) => {
      const preventive = payload<PreventiveItem[]>(records[0]);
      const immunizations = payload<Immunization[]>(records[1]);
      const late = preventive.filter((p) => p.status === 'Overdue');
      const due = preventive.filter((p) => p.status === 'Due');
      const lines = ['## Overdue', ''];
      for (const p of late) {
        lines.push(`**${p.item}** — was due ${p.dueDate}`);
        lines.push(`Last completed ${p.lastCompleted}`);
        lines.push('');
      }
      if (due.length) {
        lines.push('## Coming due', '');
        for (const p of due) {
          lines.push(`**${p.item}** — due ${p.dueDate}`);
          lines.push('');
        }
      }
      const lastFlu = immunizations.find((i) => i.vaccine.includes('Influenza'));
      if (lastFlu) lines.push(`Vaccines look current — flu shot was ${lastFlu.date}.`);
      lines.push('');
      lines.push('You already have a visit on March 25. Want me to draft a message asking to get the overdue items ordered at the same time?');
      return lines.join('\n');
    },
  },

  {
    id: 'conditions',
    match: (t: string) => /\b(conditions?|diagnos\w*|problem list|health issues?|what.s wrong|allerg\w*)\b/.test(t),
    tools: [{ tool: 'get_health_issues', args: {} }, { tool: 'get_allergies', args: {} }],
    render: (records) => {
      const issues = payload<HealthIssue[]>(records[0]);
      const allergies = payload<Allergy[]>(records[1]);
      const active = issues.filter((i) => i.status === 'Active');
      const lines = ['## Active conditions', ''];
      for (const i of active) {
        lines.push(`**${i.condition}**`);
        lines.push(`Since ${i.onsetDate} · ${i.provider}`);
        lines.push('');
      }
      lines.push('## Allergies', '');
      for (const a of allergies) {
        lines.push(`**${a.allergen}** (${a.type})`);
        lines.push(`${a.reaction} · ${a.severity}`);
        lines.push('');
      }
      return lines.join('\n');
    },
  },

  {
    id: 'vitals',
    match: (t: string) => /\b(vitals?|blood pressure|weight|bmi|heart rate|pulse|temperature)\b/.test(t),
    tools: [{ tool: 'get_vitals', args: {} }, { tool: 'get_health_summary', args: {} }],
    render: (records) => {
      const vitals = payload<VitalsEntry[]>(records[0]);
      const summary = payload<HealthSummary>(records[1]);
      const lines = ['## Latest vitals', '', `Recorded ${vitals[0].date}`, ''];
      for (const m of vitals[0].measurements) {
        lines.push(`**${m.name}** — ${m.value} ${m.units}`);
      }
      lines.push('');
      const weights = vitals
        .map((v) => ({ date: v.date, w: v.measurements.find((m) => m.name === 'Weight')?.value }))
        .filter((v) => v.w)
        .reverse();
      lines.push(`Weight trend: ${weights.map((v) => `${v.w} lbs (${v.date})`).join(' → ')}`);
      lines.push('');
      lines.push(`Blood type ${summary.bloodType}. Blood pressure has been above the usual 130/80 target at every recent reading.`);
      return lines.join('\n');
    },
  },

  {
    id: 'insurance',
    match: (t: string) => /\b(insurance|plans?|coverage|copays?|deductible|hdhp|ppo|hsa|enrollment)\b/.test(t),
    tools: [{ tool: 'get_insurance', args: {} }, { tool: 'get_billing', args: { limit: 20 } }],
    render: (records) => {
      const insurance = payload<Insurance[]>(records[0]);
      const billing = payload<BillingPage>(records[1]);
      const plan = insurance[0];
      const totalOop = billing.visits.reduce((sum, v) => sum + fmt.money(v.patientResponsibility), 0);
      return [
        '## Current plan',
        '',
        `**${plan.plan}**`,
        `Member ${plan.memberId} · Group ${plan.groupNumber}`,
        `Effective ${plan.effectiveDate}`,
        '',
        `Copays — office ${plan.copay.office}, specialist ${plan.copay.specialist}, urgent care ${plan.copay.urgentCare}, ER ${plan.copay.er}`,
        `${plan.deductible} deductible · ${plan.outOfPocketMax} out-of-pocket max`,
        '',
        '## What you have actually spent',
        '',
        `${fmt.usd(totalOop)} of patient responsibility across ${billing.visits.length} charges on file.`,
        '',
        'That is a high-utilization pattern — four chronic conditions, regular labs, and an ER visit. Ask me to run the insurance-fit skill for a proper read on what plan profile suits that.',
      ].join('\n');
    },
  },

  {
    id: 'care_team',
    match: (t: string) => /\b(care team|doctors?|physicians?|providers?|who is my|nurses?|pcp)\b/.test(t),
    tools: [{ tool: 'get_care_team', args: {} }, { tool: 'get_profile', args: {} }],
    render: (records) => {
      const team = payload<CareTeamMember[]>(records[0]);
      const profile = payload<Profile>(records[1]);
      const lines = ['## Care team', ''];
      for (const p of team) {
        lines.push(`**${p.name}**`);
        lines.push(`${p.role} · ${p.specialty}`);
        lines.push(p.phone);
        lines.push('');
      }
      lines.push(`${profile.primaryCareProvider} is listed as your primary care provider.`);
      return lines.join('\n');
    },
  },

  {
    id: 'visits',
    match: (t: string) => /\b(past visits?|history of visits?|last time i|hospital|emergency room|er visit|surgery|surgeries|clinical notes?)\b/.test(t),
    tools: [{ tool: 'get_past_visits', args: {} }, { tool: 'get_letters', args: {} }],
    render: (records) => {
      const visits = payload<PastVisit[]>(records[0]);
      const letters = payload<Letter[]>(records[1]);
      const lines = ['## Past visits', ''];
      for (const v of visits) {
        lines.push(`**${v.reason}** — ${v.date}`);
        lines.push(`${v.type} · ${v.provider} · ${v.department}`);
        lines.push(`Diagnoses: ${v.diagnoses.join(', ')}`);
        lines.push('');
      }
      lines.push(`${letters.length} after-visit summaries are on file. I can pull the full clinical notes for any of these — just name the visit.`);
      return lines.join('\n');
    },
  },

  {
    id: 'contacts',
    match: (t: string) => /\b(emergency contacts?|next of kin|in case of)\b/.test(t),
    tools: [{ tool: 'get_emergency_contacts', args: {} }],
    render: (records) => {
      const contacts = payload<EmergencyContact[]>(records[0]);
      const lines = ['## Emergency contacts', ''];
      for (const c of contacts) {
        lines.push(`**${c.name}** — ${c.relationship}`);
        lines.push(`${c.phone}  \`${c.id}\``);
        lines.push('');
      }
      lines.push('I can add, update, or remove any of these. Tell me the change and I will confirm before saving it.');
      return lines.join('\n');
    },
  },

  {
    id: 'profile',
    match: (t: string) => /\b(who am i|my profile|my info|my details|mrn|date of birth)\b/.test(t),
    tools: [{ tool: 'get_profile', args: {} }, { tool: 'get_health_summary', args: {} }],
    render: (records) => {
      const profile = payload<Profile>(records[0]);
      const summary = payload<HealthSummary>(records[1]);
      const p = profile;
      return [
        '## Profile',
        '',
        `**${p.name}**`,
        `Born ${p.dateOfBirth} · ${p.sex} · ${p.mrn}`,
        `${p.address}`,
        `${p.phone} · ${p.email}`,
        '',
        `Primary care: ${p.primaryCareProvider}`,
        '',
        `Blood type ${summary.bloodType} · ${summary.height} · ${summary.weight} · BMI ${summary.bmi}`,
      ].join('\n');
    },
  },
];

/** The catch-all: a real, tool-backed overview of the record. */
const OVERVIEW: Rule = {
  match: () => true,
  id: 'overview',
  tools: [
    { tool: 'get_health_summary', args: {} },
    { tool: 'get_health_issues', args: {} },
    { tool: 'get_medications', args: {} },
    { tool: 'get_upcoming_visits', args: {} },
    { tool: 'get_lab_results', args: { limit: 20 } },
  ],
  render: (records) => {
      const issues = payload<HealthIssue[]>(records[1]);
      const meds = payload<Medication[]>(records[2]);
      const visits = payload<Visit[]>(records[3]);
      const labs = payload<LabPage>(records[4]);
    const active = issues.filter((i) => i.status === 'Active');
    const abnormal = abnormalComponents(labs);
    const dry = meds.filter((m) => m.refillsRemaining === 0);
    const lines = [
      '## Your record at a glance',
      '',
      `${active.length} active conditions, ${meds.length} daily medications, ${labs.total} lab panels on file.`,
      '',
      '## Active conditions',
      '',
      ...active.map((i) => `- ${i.condition} (since ${i.onsetDate})`),
      '',
      '## Medications',
      '',
      ...meds.map((m) => `- ${m.name} — ${m.refillsRemaining} refill${m.refillsRemaining === 1 ? '' : 's'} left`),
      '',
      '## Flagged labs',
      '',
      `${abnormal.length} values out of range. The repeat offenders: ${[...new Set(abnormal.map((a) => a.component))].slice(0, 5).join(', ')}.`,
      '',
      '## Coming up',
      '',
      ...visits.map((v) => `- ${v.type} with ${v.provider} on ${v.date} at ${v.time}`),
      '',
    ];
    if (dry.length) lines.push(`⚠️ ${dry.map((m) => m.name).join(' and ')} out of refills.`, '');
    lines.push('Ask me about any of it — labs, bills, appointments, messages — or run one of the skills for a deeper pass.');
    return lines.join('\n');
  },
};

/* ------------------------------------------------------------------ *
 * Skill fallbacks
 * ------------------------------------------------------------------ */

type SkillRunner = { tools: ParsedToolCall[]; render: (records: ToolRecord[]) => string };

const SKILL_RUNNERS: Record<string, SkillRunner> = {
  bill_itemization: {
    tools: [
      { tool: 'get_billing', args: { limit: 20 } },
      { tool: 'get_messages', args: { limit: 20 } },
      { tool: 'get_message_recipients', args: {} },
    ],
    render: (records) => {
      const billing = payload<BillingPage>(records[0]);
      const messages = payload<MessagePage>(records[1]);
      const recipients = payload<MessageRecipients>(records[2]);
      const asked = messages.conversations.filter((c) =>
        /itemi|line.item|detailed statement/i.test(`${c.subject} ${c.preview} ${c.messages.map((m) => m.body).join(' ')}`)
      );
      const askedText = asked.map((c) => c.messages.map((m) => m.body).join(' ')).join(' ');
      const candidates = billing.visits
        .filter((v) => fmt.money(v.patientResponsibility) >= 25)
        .filter((v) => !askedText.includes(v.date))
        .sort((a, b) => fmt.money(b.patientResponsibility) - fmt.money(a.patientResponsibility));

      const billingRecipient =
        recipients.recipients.find((r) => /billing|account|customer/i.test(`${r.displayName} ${r.department}`))?.displayName ??
        recipients.recipients[0].displayName;

      const lines = [
        '## Bills without an itemized statement',
        '',
        `I checked ${billing.visits.length} charges against ${messages.conversations.length} message threads.`,
        '',
      ];
      if (asked.length) {
        lines.push(
          `Already requested: ${asked.map((c) => c.subject).join(', ')} — skipping the charges those cover.`,
          ''
        );
      }
      candidates.forEach((v, i) => {
        lines.push(`**${i + 1}. ${v.description}** — ${v.patientResponsibility}`);
        lines.push(`${v.date} · ${v.provider} · billed ${v.totalCharge}`);
        lines.push('');
      });
      lines.push(`## Draft message to ${billingRecipient}`, '');
      const top = candidates[0];
      lines.push(`> Subject: Itemized statement request — ${top.date}`);
      lines.push('>');
      lines.push(
        `> Hello, could I please receive an itemized statement for the ${top.description.toLowerCase()} on ${top.date}? The patient responsibility is listed as ${top.patientResponsibility}. Thank you.`
      );
      lines.push('');
      lines.push(
        `Reply with **all**, or the numbers you want (e.g. "1 and 3"), and I will send each request. Nothing goes out until you say so.`
      );
      return lines.join('\n');
    },
  },

  analyze_history: {
    tools: [
      { tool: 'get_lab_results', args: { limit: 20 } },
      { tool: 'get_health_issues', args: {} },
      { tool: 'get_medications', args: {} },
      { tool: 'get_preventive_care', args: {} },
      { tool: 'get_vitals', args: {} },
    ],
    render: (records) => {
      const labs = payload<LabPage>(records[0]);
      const issues = payload<HealthIssue[]>(records[1]);
      const meds = payload<Medication[]>(records[2]);
      const preventive = payload<PreventiveItem[]>(records[3]);
      const abnormal = abnormalComponents(labs);
      const byComponent = new Map<string, FlaggedComponent[]>();
      for (const c of abnormal) {
        const bucket = byComponent.get(c.component) ?? [];
        bucket.push(c);
        byComponent.set(c.component, bucket);
      }
      const repeats = [...byComponent.entries()]
        .filter(([, entries]) => entries.length > 1)
        .map(([component, entries]) => ({
          component,
          entries: entries.sort((a, b) => a.collectedDate.localeCompare(b.collectedDate)),
        }));

      const overdue = preventive.filter((p) => p.status === 'Overdue');
      const dry = meds.filter((m) => m.refillsRemaining === 0);

      const lines = ['## Patterns worth raising with Dr. Hibbert', ''];

      let n = 1;
      for (const r of repeats.slice(0, 3)) {
        const trend = r.entries.map((e) => `${e.value} (${e.collectedDate})`).join(' → ');
        lines.push(`**${n}. ${r.component} out of range on ${r.entries.length} separate draws**`);
        lines.push(`${trend}, against a reference range of ${r.entries[0].referenceRange}.`);
        lines.push(
          `A repeat pattern is a different conversation than one odd result. Ask: "My ${r.component.toLowerCase()} has been out of range on ${r.entries.length} draws — is that worth investigating further?"`
        );
        lines.push('');
        n++;
      }

      if (overdue.length) {
        lines.push(`**${n}. ${overdue.length} preventive items overdue**`);
        lines.push(overdue.map((p) => `${p.item} (due ${p.dueDate}, last done ${p.lastCompleted})`).join('; ') + '.');
        lines.push('Ask: "Can we get these ordered at my March 25 visit rather than scheduling separately?"');
        lines.push('');
        n++;
      }

      if (dry.length) {
        lines.push(`**${n}. ${dry.map((m) => m.name).join(' and ')} with no refills left**`);
        lines.push(
          `${dry[0].name} treats an active condition on your problem list and cannot be refilled without a new prescription.`
        );
        lines.push(`Ask: "Can we review whether ${dry[0].name} is still the right dose before renewing it?"`);
        lines.push('');
      }

      lines.push(
        `Context: ${issues.filter((i) => i.status === 'Active').length} active conditions on the problem list.`
      );
      lines.push('');
      lines.push('These are conversation starters, not diagnoses — your care team has the full picture.');
      return lines.join('\n');
    },
  },

  recommend_insurance: {
    tools: [
      { tool: 'get_billing', args: { limit: 20 } },
      { tool: 'get_medications', args: {} },
      { tool: 'get_health_issues', args: {} },
      { tool: 'get_upcoming_visits', args: {} },
      { tool: 'get_insurance', args: {} },
    ],
    render: (records) => {
      const billing = payload<BillingPage>(records[0]);
      const meds = payload<Medication[]>(records[1]);
      const issues = payload<HealthIssue[]>(records[2]);
      const visits = payload<Visit[]>(records[3]);
      const insurance = payload<Insurance[]>(records[4]);
      const charges = billing.visits;
      const billed = charges.reduce((s, v) => s + fmt.money(v.totalCharge), 0);
      const oop = charges.reduce((s, v) => s + fmt.money(v.patientResponsibility), 0);
      const active = issues.filter((i) => i.status === 'Active').length;
      const plan = insurance[0];

      return [
        '## Your utilization',
        '',
        `${charges.length} charges on file totalling ${fmt.usd(billed)} billed, ${fmt.usd(oop)} of it your responsibility. That includes an emergency department visit, imaging, and a surgical procedure.`,
        '',
        `${active} active chronic conditions, ${meds.length} daily prescriptions, and ${visits.length} appointments already on the calendar including fasting labs.`,
        '',
        '**Category: high utilization.** Not "one physical a year" territory — recurring labs, specialist involvement, and a real chance of another unplanned visit.',
        '',
        '## Plan profiles that tend to fit',
        '',
        '**Lower deductible, higher premium.** With this pattern the deductible and out-of-pocket maximum get hit early most years, so the premium difference usually buys back more than it costs.',
        '',
        `**Watch the network, not just the math.** Dr. Hibbert, Dr. Riviera, and Springfield General all need to stay in-network — a cheaper plan that drops any of them is a false saving.`,
        '',
        '## What to compare at open enrollment',
        '',
        `- Out-of-pocket maximum (yours is ${plan.outOfPocketMax} today — that is the number that caps a bad year)`,
        `- Specialist copay and imaging coinsurance, not just the office copay`,
        `- Prescription tier placement for all ${meds.length} of your daily medications`,
        '',
        'This is a rough fit based on past records. Compare the actual plans, premiums, and networks at open enrollment before deciding.',
      ].join('\n');
    },
  },
};

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

/**
 * Produce one assistant reply without a model.
 *
 * @param {object}   opts
 * @param {string}   opts.userText
 * @param {Function} opts.runBatch  runs tool calls against the live session
 * @param {string?}  opts.skillAddition  the active skill playbook, if any
 */
export type ScriptedTurnOptions = {
  userText: string;
  /** Runs tool calls against the live session, exactly as the agent loop does. */
  runBatch: (calls: ParsedToolCall[]) => Promise<ToolRecord[]>;
  /** The active skill playbook, if any. */
  skillAddition?: string | null;
};

export async function scriptedTurn({ userText, runBatch, skillAddition }: ScriptedTurnOptions): Promise<string> {
  const text = String(userText ?? '').toLowerCase();

  const activeSkill = skillAddition ? SKILLS.find((s) => skillAddition.includes(`[Skill: ${s.title}]`)) : null;
  const runner = activeSkill ? SKILL_RUNNERS[activeSkill.id] : null;
  if (runner) {
    const results = await runBatch(runner.tools);
    return runner.render(results);
  }

  const rule = RULES.find((r) => r.match(text)) ?? OVERVIEW;
  const results = await runBatch(rule.tools);
  return rule.render(results);
}
