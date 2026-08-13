import { inlineScript } from './assets';
import { portalLayout } from './layout';

// ─── Medications ──────────────────────────────────────────────────────
export function medicationsPage(): string {
  return portalLayout('Medications', 'Clinical/Medications', `
    <h1>Medications</h1>
    <div id="content"><div class="loading">Loading medications...</div></div>
    ${inlineScript('medications.js')}
  `);
}

// ─── Allergies ────────────────────────────────────────────────────────
export function allergiesPage(): string {
  return portalLayout('Allergies', 'Clinical/Allergies', `
    <h1>Allergies</h1>
    <div id="content"><div class="loading">Loading allergies...</div></div>
    ${inlineScript('allergies.js')}
  `);
}

// ─── Health Issues ────────────────────────────────────────────────────
export function healthIssuesPage(): string {
  return portalLayout('Health Issues', 'Clinical/HealthIssues', `
    <h1>Health Issues</h1>
    <div id="content"><div class="loading">Loading health issues...</div></div>
    ${inlineScript('health-issues.js')}
  `);
}

// ─── Immunizations ────────────────────────────────────────────────────
export function immunizationsPage(): string {
  return portalLayout('Immunizations', 'Clinical/Immunizations', `
    <h1>Immunizations</h1>
    <div id="content"><div class="loading">Loading immunizations...</div></div>
    ${inlineScript('immunizations.js')}
  `);
}

// ─── Vitals ──────────────────────────────────────────────────────────
export function vitalsPage(): string {
  return portalLayout('Vitals', 'TrackMyHealth', `
    <h1>Vitals</h1>
    <div id="content"><div class="loading">Loading vitals...</div></div>
    ${inlineScript('vitals.js')}
  `);
}

// ─── Medical History ──────────────────────────────────────────────────
export function medicalHistoryPage(): string {
  return portalLayout('Medical History', 'MedicalHistory', `
    <h1>Medical History</h1>
    <div id="content"><div class="loading">Loading medical history...</div></div>
    ${inlineScript('medical-history.js')}
  `);
}

// ─── Test Results ─────────────────────────────────────────────────────
export function testResultsPage(): string {
  return portalLayout('Test Results', 'TestResults', `
    <h1>Test Results</h1>
    <div class="tabs">
      <div class="tab active" onclick="loadResults(1, this)">Lab Results</div>
      <div class="tab" onclick="loadResults(2, this)">Imaging</div>
    </div>
    <div id="content"><div class="loading">Loading results...</div></div>
    <div id="detail" class="msg-thread"></div>
    ${inlineScript('test-results.js')}
  `);
}
