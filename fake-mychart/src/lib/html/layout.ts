import { generateCsrfToken } from '@/lib/csrf';
import { mountPrefix } from '@/lib/mount';

import { inlineScript, inlineStyle } from './assets';
import { PROXY_SELECTOR_PLACEHOLDER } from './proxySelector';

// Path prefix for every MyChart URL emitted in this HTML: '/MyChart' normally,
// '' for a root-mounted instance. Templates read `${MP()}/Foo`, so the leading
// slash comes from the prefix when there is one and from the route otherwise.
// Page scripts use the `{{MP}}` placeholder instead — see `assets.ts`.
export const MP = mountPrefix;

// The fake enforces __RequestVerificationToken on every /api/* POST, the way
// real instances do. Real MyChart's own page JS attaches the token to its API
// calls; `csrf-fetch.js` does the same for every fetch these pages issue, so
// each page script doesn't have to repeat the header plumbing.
export function csrfFetchSnippet(): string {
  return inlineScript('csrf-fetch.js');
}

// ─── Navigation ──────────────────────────────────────────────────────
const NAV_ITEMS = [
  { group: 'Overview', items: [
    { icon: '\u{1F3E0}', label: 'Home', path: 'Home' },
    { icon: '\u{1F4AC}', label: 'Messages', path: 'Messaging' },
    { icon: '\u{1F4C5}', label: 'Visits', path: 'Visits' },
  ]},
  { group: 'Health', items: [
    { icon: '\u{1F9EA}', label: 'Test Results', path: 'TestResults' },
    { icon: '\u{1F48A}', label: 'Medications', path: 'Clinical/Medications' },
    { icon: '\u26A0\uFE0F', label: 'Allergies', path: 'Clinical/Allergies' },
    { icon: '\u{1FA7A}', label: 'Health Issues', path: 'Clinical/HealthIssues' },
    { icon: '\u{1F489}', label: 'Immunizations', path: 'Clinical/Immunizations' },
    { icon: '\u{1F4CA}', label: 'Vitals', path: 'TrackMyHealth' },
    { icon: '\u{1F4CB}', label: 'Medical History', path: 'MedicalHistory' },
  ]},
  { group: 'Care', items: [
    { icon: '\u{1F468}\u200D\u2695\uFE0F', label: 'Care Team', path: 'Clinical/CareTeam' },
    { icon: '\u{1F3AF}', label: 'Goals', path: 'Goals' },
    { icon: '\u{1F500}', label: 'Referrals', path: 'Referrals' },
    { icon: '\u2705', label: 'Preventive Care', path: 'HealthAdvisories' },
    { icon: '\u{1F6E4}\uFE0F', label: 'Care Journeys', path: 'CareJourneys' },
  ]},
  { group: 'Records', items: [
    { icon: '\u2709\uFE0F', label: 'Letters', path: 'Letters' },
    { icon: '\u{1F4C4}', label: 'Documents', path: 'Documents' },
    { icon: '\u{1F4DA}', label: 'Education', path: 'Education' },
  ]},
  { group: 'Account', items: [
    { icon: '\u{1F4B3}', label: 'Billing', path: 'Billing/Summary' },
    { icon: '\u{1F6E1}\uFE0F', label: 'Insurance', path: 'Insurance' },
    { icon: '\u{1F464}', label: 'Profile', path: 'PersonalInformation' },
    { icon: '\u{1F4DE}', label: 'Emergency Contacts', path: 'EmergencyContacts' },
    { icon: '\u2699\uFE0F', label: 'Settings', path: 'Settings' },
  ]},
];

function buildNav(activePath: string): string {
  return NAV_ITEMS.map(group => `
    <div class="nav-group">
      <div class="nav-group-title">${group.group}</div>
      ${group.items.map(item => `
        <a href="${MP()}/${item.path}" class="${activePath === item.path ? 'active' : ''}">
          <span class="nav-icon">${item.icon}</span>${item.label}
        </a>
      `).join('')}
    </div>
  `).join('');
}

// ─── Portal Layout ────────────────────────────────────────────────────
export function portalLayout(title: string, activePath: string, bodyContent: string): string {
  const token = generateCsrfToken();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MyChart - ${title}</title>
  ${inlineStyle('portal.css')}
</head>
<body>
  <div class='hidden' style='display:none' id='__CSRFContainer'><input name="__RequestVerificationToken" type="hidden" value="${token}" /></div>
  ${csrfFetchSnippet()}
  <header class="mc-header">
    <div class="logo">My<span>Chart</span></div>
    <div class="user-info">
      ${PROXY_SELECTOR_PLACEHOLDER}
      <a href="${MP()}/Authentication/Login">Sign out</a>
    </div>
  </header>
  <div class="mc-layout">
    <nav class="mc-sidebar">${buildNav(activePath)}</nav>
    <main class="mc-main">${bodyContent}</main>
  </div>
</body>
</html>`;
}

// ─── Backward-compat shell (for scraper-parsed pages that need specific structure) ──
export function basePageShell(title: string, bodyContent: string): string {
  const token = generateCsrfToken();
  return `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en" dir="ltr">
<head>
  <title>${title}</title>
  <meta http-equiv="content-type" content="text/html; charset=utf-8" />
</head>
<body>
  <div class='hidden' id='__CSRFContainer'><input name="__RequestVerificationToken" type="hidden" value="${token}" /></div>
  ${csrfFetchSnippet()}
  ${bodyContent}
</body>
</html>`;
}
