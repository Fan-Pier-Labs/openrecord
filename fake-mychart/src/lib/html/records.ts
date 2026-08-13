import { inlineScript } from './assets';
import { portalLayout } from './layout';

// ─── Letters ──────────────────────────────────────────────────────────
export function lettersPage(): string {
  return portalLayout('Letters', 'Letters', `
    <h1>Letters</h1>
    <div id="content"><div class="loading">Loading letters...</div></div>
    <div id="letterDetail" class="msg-thread"></div>
    ${inlineScript('letters.js')}
  `);
}

// ─── Documents ────────────────────────────────────────────────────────
export function documentsPage(): string {
  return portalLayout('Documents', 'Documents', `
    <h1>Documents</h1>
    <div id="content"><div class="loading">Loading documents...</div></div>
    ${inlineScript('documents.js')}
  `);
}

// ─── Education ────────────────────────────────────────────────────────
export function educationPage(): string {
  return portalLayout('Education Materials', 'Education', `
    <h1>Education Materials</h1>
    <div id="content"><div class="loading">Loading education materials...</div></div>
    ${inlineScript('education.js')}
  `);
}
