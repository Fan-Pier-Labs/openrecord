import { inlineScript } from './assets';
import { portalLayout } from './layout';

// ─── Care Team ───────────────────────────────────────────────────────
// Care Team is a legacy jQuery activity on real MyChart: the page is a shell
// that POSTs /Clinical/CareTeam/Load (and /LoadExternal) and renders the result
// client-side. Nothing server-rendered here is parsed by a scraper — the
// provider list only ever comes from those two endpoints — so this page carries
// no provider markup of its own beyond what its script fills in.
export function careTeamPage(): string {
  return portalLayout('Care Team', 'Clinical/CareTeam', `
    <h1>Care Team</h1>
    <div id="content"><div class="loading">Loading care team...</div></div>
    ${inlineScript('care-team.js')}
  `);
}

// ─── Goals ──────────────────────────────────────────────────────────
export function goalsPage(): string {
  return portalLayout('Goals', 'Goals', `
    <h1>Goals</h1>
    <div id="content"><div class="loading">Loading goals...</div></div>
    ${inlineScript('goals.js')}
  `);
}

// ─── Referrals ────────────────────────────────────────────────────────
export function referralsPage(): string {
  return portalLayout('Referrals', 'Referrals', `
    <h1>Referrals</h1>
    <div id="content"><div class="loading">Loading referrals...</div></div>
    ${inlineScript('referrals.js')}
  `);
}

// ─── Preventive Care ──────────────────────────────────────────────────
// Health Advisories is a legacy jQuery activity, and its page carries NO
// advisory markup at all: the captured instance serves an empty
// `#hm-list-activity` div plus the controller that form-POSTs
// `HealthAdvisories/GetTopics` and renders the topics client-side. Not one
// <table>, <tr> or <td> in 111KB of page. A scraper that parses this page for a
// table finds nothing, which is exactly the "no screenings due" bug the fake
// used to hide by server-rendering a table it does not serve.
export function preventiveCarePage(): string {
  return portalLayout('Preventive Care', 'HealthAdvisories', `
    <h1>Preventive Care</h1>
    <div id="hm-list-activity">
\t<!-- Health Maintenance topic list goes here -->
</div>
    ${inlineScript('preventive-care.js')}
  `);
}

// ─── Care Journeys ────────────────────────────────────────────────────
export function careJourneysPage(): string {
  return portalLayout('Care Journeys', 'CareJourneys', `
    <h1>Care Journeys</h1>
    <div id="content"><div class="loading">Loading care journeys...</div></div>
    ${inlineScript('care-journeys.js')}
  `);
}
