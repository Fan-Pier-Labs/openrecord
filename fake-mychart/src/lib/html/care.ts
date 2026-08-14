import { inlineScript } from './assets';
import { portalLayout } from './layout';

// ─── Care Team ───────────────────────────────────────────────────────
export function careTeamPage(providers: Array<{ name: string; role: string; specialty: string }>): string {
  const cards = providers.map(p => `
    <div class="card careteam-provider">
      <h3 class="provider-name">${p.name}</h3>
      <div class="detail provider-role">${p.role}</div>
      <div class="meta provider-specialty">${p.specialty}</div>
    </div>
  `).join('');
  return portalLayout('Care Team', 'Clinical/CareTeam', `<h1>Care Team</h1><div class="card-grid">${cards}</div>`);
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
export function preventiveCarePage(items: Array<{ name: string; status: string; date: string }>): string {
  const rows = items.map(item => {
    const badge = item.status === 'overdue' ? 'badge-red' : item.status === 'due' ? 'badge-yellow' : 'badge-green';
    const label = item.status === 'overdue' ? 'Overdue' : item.status === 'due' ? 'Due' : 'Completed';
    const dateLabel = item.status === 'overdue' ? `Overdue since ${item.date}` : item.status === 'due' ? `Not due until ${item.date}` : `Completed on ${item.date}`;
    return `<tr><td><strong>${item.name}</strong></td><td><span class="badge ${badge}">${label}</span></td><td>${dateLabel}</td></tr>`;
  }).join('');
  // Keep original format for scraper compat
  const scraperLines = items.map(item => {
    if (item.status === 'overdue') return `${item.name}\nOverdue since ${item.date}`;
    if (item.status === 'due') return `${item.name}\nNot due until ${item.date}`;
    return `${item.name}\nCompleted on ${item.date}`;
  }).join('\n\n');
  return portalLayout('Preventive Care', 'HealthAdvisories', `
    <h1>Preventive Care</h1>
    <table><tr><th>Screening</th><th>Status</th><th>Details</th></tr>${rows}</table>
    <div class="healthAdvisories" style="display:none">${scraperLines}</div>
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
