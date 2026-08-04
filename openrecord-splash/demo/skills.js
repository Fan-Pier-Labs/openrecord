/**
 * Skill playbooks, ported from `expo-app/src/lib/skills/catalog.ts`.
 *
 * A skill is a multi-step playbook appended to the system prompt for the rest
 * of the conversation. The model still drives — the playbook just tells it
 * which tools to pull, in what order, and what to do with the answers.
 */

export const SKILLS = [
  {
    id: 'bill_itemization',
    title: 'Find bills to itemize',
    description: "Surface medical bills that don't yet have an itemized statement, then offer to request one.",
    icon: '$',
    kickoffMessage:
      "Find any historical bills I haven't already requested an itemized statement for, then offer to send those requests for me.",
    playbook: [
      '[Skill: Find bills to itemize]',
      'Goal: identify medical bills the patient has NOT yet requested an itemized statement for, and offer to send those requests through MyChart.',
      '',
      'Step 1. Call get_billing to list historical bills (with amounts and dates).',
      'Step 2. Call get_messages to read prior conversations with the billing department / patient accounts.',
      'Step 3. For each bill, decide whether the patient already asked for an itemized statement. Look in the messages for "itemized", "itemization", "detailed statement", "line-item", or anything equivalent. If a message references a bill by date or amount and asks for an itemized version, treat that bill as already requested.',
      'Step 4. Build the candidate list: bills with NO matching itemized request. Sort by amount descending. Skip bills under $25.',
      'Step 5. Present the candidate list. For each one, draft a short, polite message to the billing department requesting an itemized statement (include the bill date and amount). Call get_message_recipients so you have a real billing recipient to send to.',
      'Step 6. Ask the patient to confirm which to send. Confirm BEFORE every send_message call.',
      'Step 7. Send each confirmed request with send_message, then summarize what went out.',
      '',
      "Be efficient with tool calls — don't re-fetch billing or messages mid-skill unless something changed.",
    ].join('\n'),
  },
  {
    id: 'analyze_history',
    title: 'Analyze medical history',
    description: 'Look across labs, conditions, and history for patterns worth discussing with your doctor.',
    icon: '✦',
    kickoffMessage:
      'Look across my medical records and surface anything I should consider discussing with my doctor — recurring out-of-range labs, missing routine screenings, or risk patterns I might not have noticed.',
    playbook: [
      '[Skill: Analyze medical history]',
      "Goal: review the patient's records and surface patterns worth bringing up with their care team.",
      '',
      'Hard rule: you are NOT a doctor. Do NOT diagnose, prescribe, or recommend specific treatments. Frame every observation as something to consider asking the care team about.',
      '',
      'Step 1. Pull data: get_health_summary, get_health_issues, get_medications, get_lab_results (ask for a large limit so you see the full history), get_preventive_care, get_medical_history, get_vitals.',
      'Step 2. Look for patterns the patient might not be aware of:',
      '  - Lab values repeatedly out of range across multiple draws (the trend matters more than one result).',
      '  - Combinations that suggest a screening worth asking about.',
      '  - Routine preventive care that appears overdue.',
      '  - Medications worth a check-in (no refills left, long-term drugs with monitoring needs).',
      'Step 3. Produce a prioritized list. For each item: what you saw (cite lab names, dates, values), why it might matter in one sentence, and a specific question to ask the doctor.',
      'Step 4. Cap the list at the 5 most useful items.',
      'Step 5. Close with: "These are conversation starters, not diagnoses — your care team has the full picture."',
    ].join('\n'),
  },
  {
    id: 'recommend_insurance',
    title: 'Recommend an insurance fit',
    description: 'Estimate your medical spend pattern and suggest what kind of plan profile likely fits going forward.',
    icon: '⛨',
    kickoffMessage:
      "Based on my historic billing and ongoing care, what kind of insurance plan profile (HDHP, PPO, etc.) would likely fit me going forward? I'm trying to pick a plan at open enrollment.",
    playbook: [
      '[Skill: Recommend an insurance fit]',
      "Goal: estimate the patient's annual medical spend pattern and suggest what kind of plan profile likely fits — not a specific plan, since you can't see the plans on offer.",
      '',
      'Hard rule: you are NOT an insurance advisor. Be explicit that this is a rough fit assessment based only on past bills and current care.',
      '',
      'Step 1. Pull data: get_billing (large limit), get_medications, get_upcoming_visits, get_referrals, get_health_issues, get_insurance.',
      'Step 2. Estimate the spend pattern: total billed, patient responsibility, visit/imaging/lab frequency, recurring prescriptions, known upcoming care.',
      'Step 3. Categorize utilization: low (mostly preventive), moderate (some specialist visits plus labs/imaging), or high (chronic conditions, frequent visits, expensive meds).',
      'Step 4. Suggest plan profiles that tend to fit:',
      '  - LOW → high-deductible plan with a health savings account usually wins on total cost.',
      '  - MODERATE → a copay-based preferred-provider plan often beats a high-deductible one. Worth modeling both.',
      '  - HIGH → low-deductible / higher-premium plans often win because the deductible and out-of-pocket maximum get hit early.',
      'Step 5. Present: one paragraph on the utilization estimate with the numbers behind it, 1-2 plan profiles with one-sentence reasoning each, then 2-3 things to check when comparing real plans.',
      'Step 6. Close with: "This is a rough fit based on past records. Compare the actual plans, premiums, and networks at open enrollment before deciding."',
    ].join('\n'),
  },
];

export function getSkillById(id) {
  return SKILLS.find((s) => s.id === id);
}

/**
 * The "things to review" cards on the app's home screen.
 *
 * The real app derives these locally from billing, medications, and labs
 * (`expo-app/src/lib/alerts/generator.ts`). The demo derives them the same way
 * so the list reacts to what you do — pay attention to `resolvedWhen`, which
 * hides a card once the session state makes it moot.
 */
export function buildAlerts(session, billingData) {
  const alerts = [];

  for (const bill of billingData) {
    if (bill.status !== 'Outstanding' && bill.status !== 'Payment Plan') continue;
    alerts.push({
      id: `bill:${bill.date}:${bill.description}`,
      title: 'Outstanding bill',
      description: `${bill.patientResponsibility} for ${bill.description} — ${bill.date}`,
      ctaLabel: 'Ask about it',
      usesAi: true,
      prompt: `I have a ${bill.patientResponsibility} balance for "${bill.description}" from ${bill.date}. Walk me through what it covers and draft a message asking the billing department for an itemized statement.`,
    });
  }

  for (const med of session.medications) {
    if (med.refillsRemaining > 1) continue;
    const outOfRefills = med.refillsRemaining === 0;
    // Snapshot the count. `med` is the live session object, so closing over it
    // would compare the value to itself once a refill mutates it.
    const refillsAtBuild = med.refillsRemaining;
    alerts.push({
      id: `refill:${med.name}`,
      title: outOfRefills ? `${med.name} — no refills left` : `${med.name} — last refill`,
      description: outOfRefills
        ? `Your provider has to authorize a new prescription. Last filled ${med.lastFilled}.`
        : `${med.refillsRemaining} refill remaining at ${med.pharmacy}.`,
      ctaLabel: outOfRefills ? 'Message provider' : 'Request refill',
      usesAi: true,
      prompt: outOfRefills
        ? `My ${med.name} has no refills left. Draft a message to Dr. Hibbert asking for a new prescription, then send it once I confirm.`
        : `Request a refill of my ${med.name}.`,
      // Once a refill goes through, the card has done its job. Compare against
      // the snapshot, not lastFilled — the demo pins "today" to a fixed date,
      // so refilling twice in a session leaves lastFilled unchanged.
      resolvedWhen: (s) => {
        const current = s.medications.find((m) => m.name === med.name);
        return !current || current.refillsRemaining < refillsAtBuild;
      },
    });
  }

  alerts.push({
    id: 'preventive:colonoscopy',
    title: 'Colonoscopy overdue',
    description: 'Due May 2025, last completed May 2015.',
    ctaLabel: 'Get it scheduled',
    usesAi: true,
    prompt: 'My colonoscopy is overdue. Show me what appointment slots are open and help me get one booked.',
  });

  return alerts;
}
