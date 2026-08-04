/**
 * The offline engine.
 *
 * This is what visitors see whenever the model proxy is down or unconfigured,
 * so it has to be genuinely useful rather than a placeholder. The contract
 * these tests pin: every rule runs *real* tool calls and renders values read
 * back out of those results — the prose is canned, the data never is.
 */

import { describe, expect, test } from 'bun:test';
import { scriptedTurn } from '../src/scripted';
import { createSession, executeTool, TOOL_NAMES } from '../src/tools';
import { SKILLS, buildAlerts } from '../src/skills';
import * as data from '../src/data';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

/** Stand-in for the agent loop's batch runner; records what was called. */
function makeRunner(session: Any) {
  const called: string[] = [];
  const runBatch = async (calls: Any[]) =>
    calls.map((call) => {
      called.push(call.tool);
      return { tool: call.tool, args: call.args, result: executeTool(session, call.tool, call.args), ms: 1 };
    });
  return { runBatch, called };
}

async function ask(userText: string, skillAddition: string | null = null, session = createSession()) {
  const { runBatch, called } = makeRunner(session);
  const text = await scriptedTurn({ userText, runBatch, skillAddition });
  return { text, called, session };
}

describe('rule routing', () => {
  const cases: [string, string, string][] = [
    ['what medications am I on?', 'get_medications', 'Atorvastatin 40mg'],
    ['show me my lab results', 'get_lab_results', 'Out of range'],
    ['can I see my chest x-ray?', 'get_imaging_results', '[image:xray]'],
    ['what do I owe?', 'get_billing', 'Unpaid'],
    ['when is my next appointment?', 'get_upcoming_visits', 'Already scheduled'],
    ['any messages from my doctor?', 'get_messages', 'Messages'],
    ['what screenings am I overdue for?', 'get_preventive_care', 'Overdue'],
    ['what conditions do I have?', 'get_health_issues', 'Active conditions'],
    ['what was my blood pressure?', 'get_vitals', 'Latest vitals'],
    ['what insurance plan am I on?', 'get_insurance', 'Current plan'],
    ['who is my doctor?', 'get_care_team', 'Care team'],
    ['tell me about my past visits', 'get_past_visits', 'Past visits'],
    ['what are my emergency contacts?', 'get_emergency_contacts', 'Emergency contacts'],
    ['who am I?', 'get_profile', 'Profile'],
  ];

  for (const [question, expectedTool, expectedText] of cases) {
    test(`"${question}" calls ${expectedTool}`, async () => {
      const { text, called } = await ask(question);
      expect(called).toContain(expectedTool);
      expect(text).toContain(expectedText);
    });
  }

  test('an unmatched question falls through to a real overview', async () => {
    const { text, called } = await ask('tell me something interesting');
    expect(called).toContain('get_health_summary');
    expect(called).toContain('get_medications');
    expect(text).toContain('Your record at a glance');
  });

  test('every tool a rule requests actually exists', async () => {
    // A typo in a rule's tool list would otherwise surface as an {error} the
    // renderer then trips over.
    for (const [question] of cases) {
      const { called } = await ask(question);
      for (const name of called) expect(TOOL_NAMES).toContain(name);
    }
  });
});

describe('the numbers come from the tools, not the prose', () => {
  test('the refill count reflects live session state', async () => {
    const session = createSession();
    executeTool(session, 'request_refill', { medication_name: 'Atorvastatin' });
    executeTool(session, 'request_refill', { medication_name: 'Atorvastatin' });

    const { text } = await ask('what medications am I on?', null, session);
    expect(text).toContain('1 refill remaining');
  });

  test('a medication with no refills is called out', async () => {
    const { text } = await ask('what medications am I on?');
    expect(text).toContain('No refills remaining');
    expect(text).toContain('Metformin');
  });

  test('the billing total is summed from the ledger', async () => {
    const { text } = await ask('what do I owe?');
    // 420.00 + 189.00 + 2,760.00 across the three unpaid charges.
    expect(text).toContain('$3,369.00');
  });

  test('lab trends list every draw of a repeat offender', async () => {
    const { text } = await ask('show me my lab results');
    expect(text).toContain('7.2 on 2026-01-10');
    expect(text).toContain('6.4 on 2024-12-02');
  });

  test('a booked slot disappears from the open list', async () => {
    const session = createSession();
    const offers = executeTool(session, 'get_available_appointments', {}) as Any[];
    const slot = offers[0].slots[0];
    executeTool(session, 'book_appointment', { slot_id: slot.slotId });

    const { text } = await ask('when is my next appointment?', null, session);
    expect(text).not.toContain(`\`${slot.slotId}\``);
  });
});

describe('skill playbooks', () => {
  test('bill itemization skips bills already asked about', async () => {
    const skill = SKILLS.find((s) => s.id === 'bill_itemization')!;
    const { text, called } = await ask(skill.kickoffMessage, skill.playbook);

    expect(called).toEqual(['get_billing', 'get_messages', 'get_message_recipients']);
    expect(text).toContain('Already requested');
    // The largest un-asked-about bill leads.
    expect(text).toContain('$2,760.00');
    // A billing recipient is picked, not a clinician.
    expect(text).toContain('Patient Accounts');
    expect(text).toContain('Reply with **all**');
  });

  test('history analysis surfaces repeat out-of-range values with their trend', async () => {
    const skill = SKILLS.find((s) => s.id === 'analyze_history')!;
    const { text, called } = await ask(skill.kickoffMessage, skill.playbook);

    expect(called).toContain('get_lab_results');
    expect(called).toContain('get_preventive_care');
    expect(text).toContain('separate draws');
    expect(text).toContain('Colonoscopy');
    // The required disclaimer must survive any future edit to this rule.
    expect(text).toContain('conversation starters, not diagnoses');
  });

  test('insurance fit estimates from real spend and refuses to name a plan', async () => {
    const skill = SKILLS.find((s) => s.id === 'recommend_insurance')!;
    const { text, called } = await ask(skill.kickoffMessage, skill.playbook);

    expect(called).toContain('get_billing');
    expect(called).toContain('get_insurance');
    expect(text).toContain('high utilization');
    expect(text).toContain('Compare the actual plans');
  });

  test('an active skill overrides keyword matching', async () => {
    const skill = SKILLS.find((s) => s.id === 'analyze_history')!;
    // The text would otherwise route to the billing rule.
    const { called } = await ask('what do I owe?', skill.playbook);
    expect(called).toContain('get_lab_results');
    expect(called).not.toContain('get_billing');
  });

  test('every skill has the fields the UI and the prompt need', () => {
    for (const skill of SKILLS) {
      expect(skill.id).toBeTruthy();
      expect(skill.title).toBeTruthy();
      expect(skill.icon).toBeTruthy();
      expect(skill.kickoffMessage.length).toBeGreaterThan(20);
      // The scripted engine identifies the active skill by this marker.
      expect(skill.playbook).toContain(`[Skill: ${skill.title}]`);
    }
  });
});

describe('buildAlerts', () => {
  test('flags outstanding bills and low-refill medications', () => {
    const session = createSession();
    const alerts = buildAlerts(session, data.billing);
    const ids = alerts.map((a) => a.id);

    expect(ids.some((id: string) => id.startsWith('bill:'))).toBe(true);
    expect(ids).toContain('refill:Metformin 500mg');
    expect(ids).toContain('preventive:colonoscopy');
    // Atorvastatin has 3 refills, so it should not be nagging anyone.
    expect(ids).not.toContain('refill:Atorvastatin 40mg');
  });

  test('the out-of-refills card offers a message, not a refill request', () => {
    const alerts = buildAlerts(createSession(), data.billing);
    const metformin = alerts.find((a) => a.id === 'refill:Metformin 500mg')!;
    expect(metformin.ctaLabel).toBe('Message provider');
    expect(metformin.prompt).toContain('new prescription');
  });

  test('a refill resolves its own card', () => {
    const session = createSession();
    // Lisinopril starts at 2 refills, one above the threshold, so bring it down
    // to 1 first — that's the state where the card actually appears.
    executeTool(session, 'request_refill', { medication_name: 'Lisinopril' });

    const lisinopril = buildAlerts(session, data.billing).find((a) => a.id === 'refill:Lisinopril 20mg')!;
    expect(lisinopril).toBeTruthy();
    expect(lisinopril.resolvedWhen!(session)).toBe(false);

    executeTool(session, 'request_refill', { medication_name: 'Lisinopril' });
    expect(lisinopril.resolvedWhen!(session)).toBe(true);
  });

  test('every alert carries a prompt the chat can actually run', () => {
    for (const alert of buildAlerts(createSession(), data.billing)) {
      expect(alert.title).toBeTruthy();
      expect(alert.ctaLabel).toBeTruthy();
      expect(alert.prompt.length).toBeGreaterThan(20);
    }
  });
});
