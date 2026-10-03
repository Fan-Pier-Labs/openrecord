import { MYCHART_MEDIA_ORIGIN } from '../../scrapers/list-all-mycharts/directory';

export const SETUP_UI_MIME_TYPE = 'text/html;profile=mcp-app';

/**
 * `_meta.ui` for the ui://openrecord/setup resource.
 *
 * The host renders the widget in a sandboxed iframe whose CSP it builds from
 * this declaration, and every directive defaults to `'none'` — a resource that
 * declares nothing gets `img-src 'none'`, which is why the health-system logos
 * rendered as broken images. `resourceDomains` maps to `img-src`, so it has to
 * name Epic's media host (every directory logo) and `data:` (the bundled SVG
 * the fake-mychart sandbox entry carries inline).
 */
export const SETUP_UI_RESOURCE_META = {
  ui: { csp: { resourceDomains: [MYCHART_MEDIA_ORIGIN, 'data:'] } },
};

/**
 * Where MyChart says it sent the 2FA code, phrased for the hint line.
 * setup_account reports delivery as `{ method, contact }` — the contact is a
 * masked phone or address, and is absent whenever MyChart named no target.
 * The widget script gets this function by source (`${twoFaDeliveryLabel}`),
 * which is also the only way to reach it from a test.
 */
export function twoFaDeliveryLabel(delivery?: { method?: string; contact?: string } | null): string | null {
  if (!delivery) return null;
  if (delivery.contact) return delivery.contact;
  if (delivery.method === 'sms') return 'your phone';
  if (delivery.method === 'email') return 'your email';
  return null;
}

/**
 * The id in a "still running" note: the parking note runGuarded returns when a
 * call outruns Claude Desktop's timeout, and check_pending_call's answer while
 * it is still going. The widget waits a browser scan out through this — the
 * keychain prompt can sit unanswered for minutes. Injected by source.
 */
export function parkedCallId(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const match = /\(id "([^"]+)"\) is still running/.exec(text);
  return match ? match[1] ?? null : null;
}

/**
 * What the widget's Done button says to the conversation. It reports how the
 * passkey offer went per account rather than asking Claude to make it again.
 * `passkey`: 'registered' (just saved), 'saved' (already on file), null
 * (skipped). Injected by source.
 */
export function setupDoneMessage(accounts: { account: string; passkey: string | null }[]): string {
  const list = (xs: { account: string }[]) => xs.map(function (a) { return a.account; }).join(', ');
  let msg = accounts.length === 1
    ? 'My MyChart account ' + accounts[0]!.account + ' is now connected.'
    : 'I connected ' + accounts.length + ' MyChart accounts: ' + list(accounts) + '.';
  const registered = accounts.filter(function (a) { return a.passkey === 'registered'; });
  const declined = accounts.filter(function (a) { return a.passkey === null; });
  if (registered.length) msg += ' A passkey is now saved for ' + list(registered) + '.';
  if (declined.length) msg += ' I chose not to set up a passkey for ' + list(declined) + ' right now, so do not offer one again.';
  return msg + ' Please continue with my original request.';
}

/**
 * The bare host a picker query names, when the user typed a web address
 * rather than a health-system name — so a portal missing from the bundled
 * directory can still be connected. Accepts a pasted URL ("https://host/MyChart/")
 * and returns just the host; anything without a dotted name is a search, not
 * an address. Injected into the widget by source, like twoFaDeliveryLabel.
 */
export function typedHostname(query: string): string | null {
  const trimmed = query.trim();
  let url: URL;
  try {
    // A space anywhere in the host makes this throw, so names like "Denver Health" fall out here.
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  const labels = url.hostname.split('.');
  return labels.length > 1 && labels.every(Boolean) ? url.host : null;
}

/**
 * Interactive Setup Widget for OpenRecord.
 *
 * Served via the MCP Apps ui:// protocol. The user first picks a route:
 *   Import — a permission screen, then import_browser_passwords; the user
 *     picks one login, which runs connect_imported_account. The widget only
 *     ever sees import ids, never a password.
 *   Manual — pick a health system from an autocomplete dropdown (results
 *     appear only after typing; a query that is itself a web address also
 *     offers a "Use <host>" row, for portals the directory doesn't list), then
 *     enter credentials, which runs setup_account.
 * Each account runs to the end — 2FA (complete_2fa), then the passkey offer —
 * before the widget asks whether to connect another, by import or by hand.
 * "I'm done" hands back to the chat. See docs/mcpb-setup-flow.md.
 */
const SETUP_UI_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Connect MyChart</title>
  <style>
    :root {
      --bg: #ffffff;
      --text: #1a1a1a;
      --accent: #0066cc;
      --border: #e0e0e0;
      --hover: #f5f5f5;
      --error: #d32f2f;
      --success: #388e3c;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #1e1e1e;
        --text: #e0e0e0;
        --accent: #4da3ff;
        --border: #333333;
        --hover: #2d2d2d;
      }
    }
    /* The UA [hidden] rule (display:none) loses to component rules like
       .field { display:flex }, so make the hidden attribute authoritative. */
    [hidden] { display: none !important; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 10px 12px;
      line-height: 1.3;
    }
    .container {
      max-width: 400px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    h1 {
      font-size: 15px;
      margin: 0 0 2px 0;
      font-weight: 700;
    }
    .step-sub {
      font-size: 12px;
      opacity: 0.7;
      margin: 0 0 4px 0;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    label {
      font-weight: 600;
      font-size: 12px;
      opacity: 0.8;
    }
    input {
      background: var(--bg);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 7px 10px;
      border-radius: 6px;
      font-size: 13px;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus {
      border-color: var(--accent);
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 4px;
    }
    button {
      background: var(--accent);
      color: white;
      border: none;
      padding: 9px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .link-btn {
      background: none;
      color: var(--accent);
      padding: 0;
      font-size: 12px;
      font-weight: 600;
      align-self: flex-start;
      width: auto;
    }
    .link-btn:hover { text-decoration: underline; }
    .status {
      font-size: 12px;
      padding: 7px 10px;
      border-radius: 6px;
      display: none;
    }
    .status.error {
      display: block;
      background: rgba(211, 47, 47, 0.1);
      color: var(--error);
      border: 1px solid rgba(211, 47, 47, 0.2);
    }
    .status.success {
      display: block;
      background: rgba(56, 142, 60, 0.1);
      color: var(--success);
      border: 1px solid rgba(56, 142, 60, 0.2);
    }
    .loader {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255,255,255,0.3);
      border-radius: 50%;
      border-top-color: #fff;
      animation: spin 1s ease-in-out infinite;
      margin-right: 6px;
      vertical-align: middle;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .combobox {
      position: relative;
    }
    .results {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      margin: 4px 0 0 0;
      padding: 4px 0;
      list-style: none;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      max-height: 240px;
      overflow-y: auto;
      z-index: 10;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    }
    .results li {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      cursor: pointer;
      font-size: 13px;
    }
    .results li:hover,
    .results li.active {
      background: var(--hover);
    }
    .results li.loading,
    .results li.empty {
      cursor: default;
      opacity: 0.7;
      font-style: italic;
      font-size: 12px;
    }
    .results li.loading:hover,
    .results li.empty:hover {
      background: transparent;
    }
    /* An entry that exists but can't be connected right now (the test sandbox
       while it's torn down). Shown rather than hidden, so it doesn't look like
       the entry disappeared — greyed out, unselectable, with the reason under
       the name. */
    .results li.unavailable {
      cursor: default;
      opacity: 0.55;
    }
    .results li.unavailable:hover,
    .results li.unavailable.active {
      background: transparent;
    }
    .results .row-unavailable {
      font-size: 11px;
      font-style: italic;
      opacity: 0.9;
      white-space: normal;
    }
    .results .row-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
    }
    .results .row-name {
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .results .row-host {
      font-size: 11px;
      opacity: 0.65;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    /* MyChart logos are wide banners (~640x230), so the slot is a banner-shaped
       rectangle. A white backing keeps dark-text logos legible in dark mode.
       The slot is fixed-size so names stay aligned whether or not a logo loads;
       .row-logo-empty paints a neutral placeholder for entries with no logo. */
    .results img.row-logo {
      width: 56px;
      height: 26px;
      border-radius: 4px;
      object-fit: contain;
      background: #ffffff;
      padding: 1px 3px;
      box-sizing: border-box;
      flex-shrink: 0;
    }
    .results img.row-logo-empty {
      background: var(--hover);
      padding: 0;
      border: 1px solid var(--border);
    }
    /* Pages 2 & 3: the chosen system's banner sits prominently above the
       inputs, with the hostname beneath it (centered column). */
    .instance-header {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 6px;
      padding: 14px 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--hover);
    }
    .instance-logo {
      max-width: 230px;
      width: auto;
      height: 48px;
      object-fit: contain;
      background: #ffffff;
      border-radius: 6px;
      padding: 4px 10px;
      box-sizing: border-box;
    }
    .instance-name {
      font-weight: 700;
      font-size: 15px;
      max-width: 100%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .field-error {
      color: var(--error);
      font-size: 12px;
      margin: 2px 0 0 0;
    }
    .success-card {
      display: none;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 8px;
      padding: 18px 12px;
      border-radius: 10px;
      background: rgba(56, 142, 60, 0.08);
      border: 1px solid rgba(56, 142, 60, 0.25);
    }
    .success-card.visible { display: flex; }
    .check-circle {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: var(--success);
      display: flex;
      align-items: center;
      justify-content: center;
      animation: pop 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.3);
    }
    .check-circle svg {
      width: 32px;
      height: 32px;
      stroke: #fff;
      stroke-width: 4;
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-dasharray: 30;
      stroke-dashoffset: 30;
      animation: draw 0.4s ease-out 0.2s forwards;
    }
    .success-title {
      font-size: 16px;
      font-weight: 700;
      color: var(--success);
      margin: 0;
    }
    .success-sub {
      font-size: 12px;
      opacity: 0.75;
      margin: 0;
      word-break: break-all;
    }
    .success-hint {
      font-size: 11px;
      opacity: 0.7;
      margin: 4px 0 0 0;
    }
    .success-hint kbd {
      font-family: inherit;
      font-size: 10px;
      padding: 1px 5px;
      border: 1px solid var(--border);
      border-radius: 3px;
      background: var(--bg);
    }
    /* Step 4: the passkey offer, shown after login when none is saved. */
    .passkey-card {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px 14px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--hover);
    }
    .passkey-badge {
      align-self: flex-start;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--success);
      background: rgba(56, 142, 60, 0.12);
      border: 1px solid rgba(56, 142, 60, 0.3);
      border-radius: 999px;
      padding: 2px 8px;
    }
    .passkey-card p {
      margin: 0;
      font-size: 13px;
    }
    .passkey-card ul {
      margin: 0;
      padding-left: 18px;
      font-size: 12px;
      line-height: 1.45;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .passkey-note {
      font-size: 11px;
      opacity: 0.7;
    }
    /* The first screen: two ways in, as large tappable cards. */
    .choice {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 3px;
      width: 100%;
      text-align: left;
      background: var(--bg);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 14px;
      font-weight: 400;
    }
    .choice:hover { border-color: var(--accent); background: var(--hover); }
    .choice-title { font-weight: 700; font-size: 14px; }
    .choice-sub { font-size: 12px; opacity: 0.75; }
    .choice .passkey-badge { margin-bottom: 2px; }
    /* Each step stacks its own children; [hidden] above still wins. */
    [id^="step-"] { display: flex; flex-direction: column; gap: 8px; }
    /* Found logins and connected accounts share one row layout. */
    .account-list {
      list-style: none;
      margin: 0;
      padding: 0;
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }
    .account-list li {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 12px;
      font-size: 13px;
    }
    .account-list li + li { border-top: 1px solid var(--border); }
    .account-list label {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
      min-width: 0;
      cursor: pointer;
      opacity: 1;
      font-weight: 400;
      font-size: 13px;
    }
    .account-list li.disabled label { cursor: default; opacity: 0.55; }
    .account-list input[type=radio] { width: 16px; height: 16px; margin: 0; flex-shrink: 0; accent-color: var(--accent); }
    .account-list .row-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
    .account-list .row-name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .account-list .row-host { font-size: 11px; opacity: 0.65; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .account-list .row-note { font-size: 11px; font-style: italic; opacity: 0.8; }
    .account-list .row-error { font-size: 11px; color: var(--error); }
    .mark { width: 18px; text-align: center; font-weight: 700; flex-shrink: 0; }
    .mark.ok { color: var(--success); }
    .mark.fail { color: var(--error); }
    /* "I'm done" sits under Connect while there are logins left to import. */
    button.secondary { background: none; color: var(--text); border: 1px solid var(--border); }
    button.secondary:hover { background: var(--hover); }
    .working {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-size: 13px;
      padding: 8px 0;
    }
    .working .loader { border-color: var(--border); border-top-color: var(--accent); margin: 0; }
    @keyframes pop {
      0% { transform: scale(0); }
      80% { transform: scale(1.08); }
      100% { transform: scale(1); }
    }
    @keyframes draw {
      to { stroke-dashoffset: 0; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1 id="title">Connect to MyChart</h1>

    <div id="status" class="status"></div>

    <!-- ── Choose a route: import from the browser, or type it in ──────── -->
    <div id="step-choose">
      <p class="step-sub">How would you like to connect your MyChart account?</p>
      <button id="choose-import" class="choice" type="button">
        <span class="passkey-badge">Easiest</span>
        <span class="choice-title">Import from your browser</span>
        <span class="choice-sub">Use MyChart logins you've already saved in Chrome, Arc, Brave, Edge or Firefox.</span>
      </button>
      <button id="choose-manual" class="choice" type="button">
        <span class="choice-title">Enter manually</span>
        <span class="choice-sub">Search for your health system and type your username and password.</span>
      </button>
    </div>

    <!-- ── Import: ask before reading the browser's password store ─────── -->
    <div id="step-consent" hidden>
      <button id="back-consent" class="link-btn" type="button">‹ Back</button>
      <div class="passkey-card">
        <p><strong>OpenRecord needs your permission</strong> to look through the passwords saved in your browsers on this computer for MyChart logins.</p>
        <ul>
          <li><strong>Read-only.</strong> Nothing in your browser is changed, and only MyChart logins are kept.</li>
          <li><strong>Stays on this computer.</strong> Passwords are never shown to Claude or sent to Anthropic. One is used only to sign in to its own MyChart portal, and only for an account you pick next.</li>
          <li><strong>Your computer will ask too.</strong> On a Mac you'll see a system prompt to access your keychain, possibly one per browser. Click <strong>Allow</strong>.</li>
        </ul>
        <p class="passkey-note">To confirm a saved login is really MyChart, OpenRecord may load the sign-in page of a portal it doesn't already know.</p>
      </div>
      <div class="actions">
        <button id="scan">Allow and search my browsers</button>
        <p class="step-sub" id="scan-hint" hidden>Waiting for permission. If a system prompt appears, click Allow.</p>
        <p class="field-error" id="scan-error" hidden></p>
      </div>
    </div>

    <!-- ── The hub: pick one login to import; back here after every account ── -->
    <div id="step-accounts" hidden>
      <button id="back-accounts" class="link-btn" type="button">‹ Back</button>
      <ul id="connected-list" class="account-list" hidden></ul>
      <p class="step-sub" id="accounts-sub"></p>
      <ul id="found-list" class="account-list"></ul>
      <div class="actions">
        <button id="connect-selected">Connect</button>
        <p class="field-error" id="accounts-error" hidden></p>
        <button id="done" class="secondary" type="button">I'm done</button>
        <button id="accounts-import" class="link-btn" type="button">Import from your browser</button>
        <button id="accounts-manual" class="link-btn" type="button">Enter an account manually</button>
      </div>
    </div>

    <!-- ── Import: signing in to one of the chosen accounts ───────────── -->
    <div id="step-connecting" hidden>
      <div class="instance-header">
        <img id="instance-logo-connecting" class="instance-logo" alt="">
        <div class="instance-name" id="instance-name-connecting"></div>
      </div>
      <div class="working"><span class="loader"></span><span id="connecting-text">Signing in…</span></div>
    </div>

    <!-- ── Pick a health system (manual route) ───────────────────────── -->
    <div id="step-picker" hidden>
      <button id="back-picker" class="link-btn" type="button">‹ Back</button>
      <p class="step-sub">Search for your hospital or clinic, then pick it from the list. Not listed? Type your MyChart web address instead.</p>
      <div class="field combobox">
        <input type="text" id="search" placeholder="Search hospital or clinic (e.g. 'Denver Health')" autocomplete="off" spellcheck="false">
        <ul id="results" class="results" hidden></ul>
      </div>
    </div>

    <!-- ── Step 2: credentials for the chosen system ──────────────────── -->
    <div id="step-creds" hidden>
      <button id="back" class="link-btn" type="button">‹ Change health system</button>

      <div class="instance-header">
        <img id="instance-logo" class="instance-logo" alt="">
        <div class="instance-name" id="instance-name"></div>
      </div>

      <div class="field">
        <label>Username</label>
        <input type="text" id="username" placeholder="MyChart username" autocomplete="off">
      </div>

      <div class="field">
        <label>Password</label>
        <input type="password" id="password" placeholder="MyChart password">
      </div>

      <div class="actions">
        <button id="submit">Connect Account</button>
        <p class="field-error" id="creds-error" hidden></p>
      </div>
    </div>

    <!-- ── Step 3: 2FA — only reached when the portal requires a code ──── -->
    <div id="step-2fa" hidden>
      <button id="back-2fa" class="link-btn" type="button">‹ Back</button>

      <div class="instance-header">
        <img id="instance-logo-2fa" class="instance-logo" alt="">
        <div class="instance-name" id="instance-name-2fa"></div>
      </div>

      <p class="step-sub" id="twofa-hint">Enter the 6-digit verification code to finish signing in.</p>

      <div class="field">
        <label>Verification Code</label>
        <input type="text" id="2fa-code" placeholder="6-digit code" maxlength="6" inputmode="numeric" autocomplete="one-time-code">
      </div>

      <div class="actions">
        <button id="verify">Verify Code</button>
        <p class="field-error" id="twofa-error" hidden></p>
      </div>
    </div>

    <!-- ── Step 4: offer a passkey — only when the account has none saved ── -->
    <div id="step-passkey" hidden>
      <div class="passkey-card">
        <span class="passkey-badge">Recommended</span>
        <p><strong>You're signed in.</strong> Set up a passkey so Claude can reconnect on its own next time.</p>
        <ul>
          <li><strong>No more codes.</strong> When your MyChart session expires, Claude signs back in without your username, password or a verification code. Without a passkey, you may be asked for a new code each time.</li>
          <li><strong>Stays on this computer.</strong> The private key is stored in <span id="passkey-storage">your OS keystore</span>. It is never sent to Anthropic.</li>
          <li><strong>Lives on your MyChart account.</strong> It adds a new sign-in credential to <span id="passkey-instance">MyChart</span> that stays valid until you remove it. Ask Claude to delete the passkey, or disconnect the account, at any time.</li>
        </ul>
        <p class="passkey-note">Some health systems don't allow passkeys to be registered from the portal. If this one doesn't, the account still works; you'll just be asked for a code when the session expires.</p>
      </div>
      <div class="actions">
        <button id="register-passkey">Set up passkey</button>
        <button id="skip-passkey" class="link-btn" type="button">Skip for now</button>
        <p class="field-error" id="passkey-error" hidden></p>
      </div>
    </div>

    <!-- ── Success ─────────────────────────────────────────────────────── -->
    <div id="success-card" class="success-card">
      <div class="check-circle">
        <svg viewBox="0 0 24 24"><polyline points="5 12.5 10 17.5 19 7.5"></polyline></svg>
      </div>
      <p class="success-title">Connected!</p>
      <p class="success-sub" id="success-host"></p>
      <p class="success-hint">Press <kbd>Enter</kbd> in the chat to continue.</p>
    </div>
  </div>

  <script>
    var $ = function (id) { return document.getElementById(id); };
    var titleEl = $('title');
    var statusDiv = $('status');
    var searchInput = $('search');
    var resultsList = $('results');
    var backBtn = $('back');
    var back2faBtn = $('back-2fa');
    var instanceLogo = $('instance-logo');
    var instanceName = $('instance-name');
    var instanceLogo2fa = $('instance-logo-2fa');
    var instanceName2fa = $('instance-name-2fa');
    var twoFaHint = $('twofa-hint');
    var usernameInput = $('username');
    var passwordInput = $('password');
    var twoFaInput = $('2fa-code');
    var submitBtn = $('submit');
    var verifyBtn = $('verify');
    var credsError = $('creds-error');
    var twoFaError = $('twofa-error');
    var successCard = $('success-card');
    var successHost = $('success-host');
    var passkeyStorage = $('passkey-storage');
    var passkeyInstance = $('passkey-instance');
    var registerPasskeyBtn = $('register-passkey');
    var skipPasskeyBtn = $('skip-passkey');
    var passkeyError = $('passkey-error');
    var scanBtn = $('scan');
    var scanHint = $('scan-hint');
    var scanError = $('scan-error');
    var accountsSub = $('accounts-sub');
    var accountsError = $('accounts-error');
    var connectedList = $('connected-list');
    var foundList = $('found-list');
    var connectSelectedBtn = $('connect-selected');
    var doneBtn = $('done');

    var pendingId = null;
    var connectedAccount = null;
    var selectedInstance = null;
    var currentRows = [];
    var activeIndex = -1;

    // Import route. One login is connected at a time — nearly every portal asks
    // for a 2FA code, so each account runs to the end before the next is
    // offered. scanned is null until the browser has been searched; importing
    // is true while the login in flight came from it, which is what the back
    // buttons on the sign-in and 2FA steps check.
    var scanned = null;
    var importing = false;
    var currentImport = null;

    // Accounts connected so far, in order: { name, account, passkey }.
    var connected = [];

    var STEPS = {
      choose: { el: $('step-choose'), title: 'Connect to MyChart' },
      consent: { el: $('step-consent'), title: 'Import from your browser' },
      accounts: { el: $('step-accounts'), title: 'MyChart logins found' },
      connecting: { el: $('step-connecting'), title: 'Signing in' },
      picker: { el: $('step-picker'), title: 'Find your health system' },
      creds: { el: $('step-creds'), title: 'Sign in to MyChart' },
      twofa: { el: $('step-2fa'), title: 'Two-step verification' },
      passkey: { el: $('step-passkey'), title: 'Set up a passkey?' },
      done: { el: null, title: 'Connected' },
    };

    function showStep(step) {
      Object.keys(STEPS).forEach(function (k) {
        if (STEPS[k].el) STEPS[k].el.hidden = k !== step;
      });
      successCard.classList.remove('visible');
      titleEl.innerText = (STEPS[step] || STEPS.choose).title;
    }

    // Fill an instance header: the system's banner logo above its full name.
    // No hostname. If the logo is missing or fails to load, just the name shows.
    function fillHeader(logoImg, nameEl, inst) {
      nameEl.innerText = (inst && (inst.name || inst.hostname)) || '';
      if (inst && inst.logoUrl) {
        logoImg.src = inst.logoUrl;
        logoImg.style.display = '';
        logoImg.onerror = function () { logoImg.style.display = 'none'; };
      } else {
        logoImg.style.display = 'none';
        logoImg.removeAttribute('src');
      }
    }

    // Inline error label shown directly beneath a step's action button.
    function showError(el, msg) { el.innerText = msg; el.hidden = false; }
    function clearError(el) { el.innerText = ''; el.hidden = true; }

    function showStatus(msg, type) {
      statusDiv.innerText = msg;
      statusDiv.className = 'status ' + (type || 'error');
    }
    function hideStatus() {
      statusDiv.style.display = 'none';
      statusDiv.className = 'status';
    }

    function setBusy(btn, label) {
      btn.disabled = true;
      btn.innerHTML = '<span class="loader"></span> ' + label;
    }
    function setIdle(btn, label) {
      btn.disabled = false;
      btn.innerText = label;
    }

    // callTool flattens an isError result to its "Error: …" text.
    function errorText(result, fallback) {
      var msg = typeof result === 'string' ? result : (result && result.message) || fallback;
      return msg.indexOf('Error: ') === 0 ? msg.slice(7) : msg;
    }

    // ── MCP Apps JSON-RPC bridge ────────────────────────────────────────────
    var MCP_APP_PROTOCOL_VERSION = '2026-01-26';
    var nextRpcId = 0;
    var pendingRpc = new Map();
    var handshakeDone = null;

    window.addEventListener('message', function (event) {
      if (event.source !== window.parent) return;
      var msg = event.data;
      if (!msg || msg.jsonrpc !== '2.0') return;
      if (msg.id != null && pendingRpc.has(msg.id)) {
        var entry = pendingRpc.get(msg.id);
        pendingRpc.delete(msg.id);
        if (msg.error) entry.reject(new Error(msg.error.message || 'RPC error'));
        else entry.resolve(msg.result);
      }
    });

    function rpc(method, params) {
      var id = nextRpcId++;
      return new Promise(function (resolve, reject) {
        pendingRpc.set(id, { resolve: resolve, reject: reject });
        window.parent.postMessage({ jsonrpc: '2.0', id: id, method: method, params: params }, '*');
      });
    }

    function notify(method, params) {
      window.parent.postMessage({ jsonrpc: '2.0', method: method, params: params }, '*');
    }

    function ensureHandshake() {
      if (!handshakeDone) {
        handshakeDone = (async function () {
          await rpc('ui/initialize', {
            appInfo: { name: 'openrecord-setup', version: '2.0.0' },
            appCapabilities: {},
            protocolVersion: MCP_APP_PROTOCOL_VERSION,
          });
          notify('ui/notifications/initialized', {});
        })();
      }
      return handshakeDone;
    }

    async function callToolOnce(name, args) {
      await ensureHandshake();
      var result = await rpc('tools/call', { name: name, arguments: args });
      if (result && result.content && Array.isArray(result.content)) {
        var textContent = result.content.find(function (c) { return c.type === 'text'; });
        if (textContent) {
          try { return JSON.parse(textContent.text); }
          catch (e) { return textContent.text; }
        }
      }
      return result;
    }

    // Injected by source from ui.ts so each has one home and a test.
    var parkedCallId = ${parkedCallId};
    var setupDoneMessage = ${setupDoneMessage};

    // A call that outruns the host's timeout comes back as a parking note, not
    // its result — a scan waiting on the keychain prompt, or a slow portal.
    // Wait it out the way the note says to, so every caller sees the result.
    async function callTool(name, args) {
      var result = await callToolOnce(name, args);
      var id;
      while ((id = parkedCallId(result))) {
        result = await callToolOnce('check_pending_call', { id: id });
      }
      return result;
    }

    // ── Choose a route ──────────────────────────────────────────────────────
    function goToChoose() {
      importing = false;
      hideStatus();
      showStep('choose');
    }

    function goToConsent() {
      clearError(scanError);
      scanHint.hidden = true;
      setIdle(scanBtn, 'Allow and search my browsers');
      showStep('consent');
    }

    $('choose-import').onclick = goToConsent;
    $('choose-manual').onclick = function () { goToPicker(); };
    $('back-consent').onclick = function () { if (connected.length) showAccounts(); else goToChoose(); };
    $('back-picker').onclick = function () { if (connected.length) showAccounts(); else goToChoose(); };

    // ── Import: scan the browsers, after the user has said yes ──────────────
    scanBtn.onclick = async function () {
      clearError(scanError);
      setBusy(scanBtn, 'Searching your browsers…');
      scanHint.hidden = false;
      try {
        // list_accounts marks logins that are already connected, so picking
        // one again doesn't cost the user a fresh 2FA code.
        var results = await Promise.all([
          callTool('import_browser_passwords', {}),
          callTool('list_accounts', {}).catch(function () { return null; }),
        ]);
        var scan = results[0];
        var saved = (results[1] && Array.isArray(results[1].accounts)) ? results[1].accounts : [];
        scanHint.hidden = true;
        setIdle(scanBtn, 'Search again');
        if (!scan || typeof scan !== 'object') {
          showError(scanError, errorText(scan, 'Could not read your browser passwords.'));
          return;
        }
        scanned = {
          supported: scan.supported !== false,
          saved: saved.map(function (a) { return a.account || (a.username + '@' + a.hostname); }),
          entries: scan.accounts || [],
        };
        clearError(accountsError);
        showAccounts();
      } catch (e) {
        scanHint.hidden = true;
        setIdle(scanBtn, 'Try again');
        showError(scanError, 'Error: ' + (e && e.message ? e.message : e));
      }
    };

    // ── The hub: one login to import at a time, and back here after each ────
    function idOf(entry) { return (entry.username + '@' + entry.hostname).toLowerCase(); }
    function isConnected(id) {
      return connected.some(function (c) { return c.account.toLowerCase() === id; });
    }

    // What the found list still offers: anything connected in this widget is
    // dropped (it is in the ✓ list above), and an account connected earlier or
    // a login saved without a username is shown but can't be picked.
    function importRows() {
      if (!scanned) return [];
      return scanned.entries
        .filter(function (a) { return !a.username || !isConnected(idOf(a)); })
        .map(function (a) {
          var note = null;
          if (!a.username) note = 'No username saved. Enter this one manually.';
          else if (scanned.saved.some(function (id) { return id.toLowerCase() === idOf(a); })) note = 'Already connected';
          return { entry: a, note: note };
        });
    }

    function rowText(title, subtitle, note) {
      var text = document.createElement('div');
      text.className = 'row-text';
      var name = document.createElement('span');
      name.className = 'row-name';
      name.innerText = title;
      text.appendChild(name);
      var sub = document.createElement('span');
      sub.className = 'row-host';
      sub.innerText = subtitle;
      text.appendChild(sub);
      if (note) {
        var n = document.createElement('span');
        n.className = 'row-note';
        n.innerText = note;
        text.appendChild(n);
      }
      return text;
    }

    function showAccounts() {
      importing = false;
      currentImport = null;
      hideStatus();

      connectedList.innerHTML = '';
      connected.forEach(function (c) {
        var li = document.createElement('li');
        var mark = document.createElement('span');
        mark.className = 'mark ok';
        mark.innerText = '✓';
        li.appendChild(mark);
        li.appendChild(rowText(c.name, c.account + (c.passkey ? ' · passkey saved' : '')));
        connectedList.appendChild(li);
      });
      connectedList.hidden = connected.length === 0;

      var rows = importRows();
      var pickable = rows.filter(function (r) { return !r.note; });
      foundList.innerHTML = '';
      rows.forEach(function (r, i) {
        var a = r.entry;
        var li = document.createElement('li');
        if (r.note) li.className = 'disabled';
        var label = document.createElement('label');
        var radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'found';
        radio.id = 'found-' + i;
        radio.disabled = !!r.note;
        radio.checked = r === pickable[0];
        r.radio = radio;
        label.appendChild(radio);
        label.appendChild(rowText(
          a.instance_name || a.hostname,
          [a.username, a.source ? 'from ' + a.source : null, a.instance_name ? a.hostname : null].filter(Boolean).join(' · '),
          r.note,
        ));
        li.appendChild(label);
        foundList.appendChild(li);
      });
      currentRowsFound = rows;
      foundList.hidden = pickable.length === 0;
      connectSelectedBtn.hidden = pickable.length === 0;
      setIdle(connectSelectedBtn, 'Connect');

      // Nothing connected yet: this is the list straight after the scan.
      // Afterwards it is the "another one?" question, with a way to stop.
      var first = connected.length === 0;
      if (!scanned) {
        accountsSub.innerText = 'Connect another account, or finish.';
      } else if (!scanned.supported) {
        accountsSub.innerText = 'Importing from a browser works on macOS and Windows only. You can enter your account manually instead.';
      } else if (pickable.length) {
        accountsSub.innerText = first
          ? 'Pick one to connect. You can import more after this one.'
          : 'Import another one?';
      } else if (first) {
        accountsSub.innerText = "We didn't find any MyChart logins in your browsers that can be imported. You can enter your account manually instead.";
      } else {
        accountsSub.innerText = 'There are no more logins in your browsers to import.';
      }

      $('back-accounts').hidden = !first;
      doneBtn.hidden = first;
      // "I'm done" is the main action once nothing is left to import.
      doneBtn.className = pickable.length ? 'secondary' : '';
      $('accounts-import').hidden = !!scanned;
      $('accounts-manual').innerText = first ? 'Enter an account manually instead' : 'Enter an account manually';

      showStep('accounts');
      titleEl.innerText = first ? 'MyChart logins found' : connected.length === 1 ? 'Account connected' : connected.length + ' accounts connected';
    }

    var currentRowsFound = [];

    $('back-accounts').onclick = goToConsent;
    $('accounts-import').onclick = goToConsent;
    $('accounts-manual').onclick = function () { goToPicker(); };

    connectSelectedBtn.onclick = function () {
      var chosen = currentRowsFound.find(function (r) { return r.radio && r.radio.checked && !r.note; });
      if (chosen) connectImport(chosen.entry);
    };

    async function connectImport(entry) {
      clearError(accountsError);
      importing = true;
      currentImport = entry;
      selectedInstance = { name: entry.instance_name || entry.hostname, hostname: entry.hostname, fromImport: true };
      fillHeader($('instance-logo-connecting'), $('instance-name-connecting'), selectedInstance);
      $('connecting-text').innerText = 'Signing in as ' + entry.username + '…';
      showStep('connecting');

      var result;
      try {
        result = await callTool('connect_imported_account', { import_id: entry.import_id });
      } catch (e) {
        importFailed('Error: ' + (e && e.message ? e.message : e));
        return;
      }
      if (result && result.state === 'need_2fa') {
        pendingId = result.pending_id;
        showTwoFa(result.delivery || null);
      } else if (result && result.state === 'logged_in') {
        showSuccess(result.account || entry.hostname, result);
      } else if (result && result.state === 'invalid_login') {
        // The saved password is stale. The import id is spent either way, so
        // carry on as a manual sign-in with the username already filled in.
        selectInstance(selectedInstance, entry.username);
        showError(credsError, "The password saved in your browser didn't work. It may be out of date — enter your current one.");
      } else {
        importFailed(errorText(result, 'Sign-in failed.'));
      }
    }

    function importFailed(message) {
      // Import ids are held for 10 minutes after the scan; a slow round of 2FA
      // codes can outlast them, and only a fresh scan gets new ones.
      if (/expired/i.test(message)) {
        scanned = null;
        message = 'Saved logins are only kept for 10 minutes after searching. Import from your browser again to continue.';
      }
      showAccounts();
      showError(accountsError, message);
    }

    // ── Pick a health system (manual route) ─────────────────────────────────
    var searchEpoch = 0;
    var searchDebounce = 0;

    function hideResults() {
      resultsList.hidden = true;
      resultsList.innerHTML = '';
      currentRows = [];
      activeIndex = -1;
    }

    // Arrow keys step over rows that can't be picked, so an unavailable entry
    // is never the thing Enter lands on. Returns -1 when nothing is pickable.
    function nextSelectable(from, step) {
      var n = currentRows.length;
      for (var k = 1; k <= n; k++) {
        var idx = ((from + step * k) % n + n) % n;
        if (!currentRows[idx].unavailable) return idx;
      }
      return -1;
    }

    function setActive(i) {
      activeIndex = i;
      var items = resultsList.children;
      for (var idx = 0; idx < items.length; idx++) {
        if (idx === i) {
          items[idx].classList.add('active');
          items[idx].scrollIntoView({ block: 'nearest' });
        } else {
          items[idx].classList.remove('active');
        }
      }
    }

    function renderRows(rows, emptyText) {
      resultsList.innerHTML = '';
      currentRows = rows;
      activeIndex = -1;
      if (!rows || rows.length === 0) {
        var li = document.createElement('li');
        li.className = 'empty';
        li.innerText = emptyText || 'No matching health systems.';
        resultsList.appendChild(li);
        resultsList.hidden = false;
        return;
      }
      rows.forEach(function (r, i) {
        var li = document.createElement('li');
        li.setAttribute('data-index', String(i));

        var img = document.createElement('img');
        img.className = 'row-logo';
        if (r.logoUrl) {
          img.src = r.logoUrl;
          img.alt = '';
          img.onerror = function () { img.classList.add('row-logo-empty'); img.removeAttribute('src'); };
        } else {
          img.classList.add('row-logo-empty');
        }
        li.appendChild(img);

        var text = document.createElement('div');
        text.className = 'row-text';
        var name = document.createElement('span');
        name.className = 'row-name';
        name.innerText = r.name || r.hostname;
        text.appendChild(name);
        if (r.custom) {
          var hint = document.createElement('span');
          hint.className = 'row-host';
          hint.innerText = 'Not in our list. Connect to this address directly.';
          text.appendChild(hint);
        } else if (r.unavailable) {
          var note = document.createElement('span');
          note.className = 'row-unavailable';
          note.innerText = r.unavailable;
          text.appendChild(note);
        } else {
          var host = document.createElement('span');
          host.className = 'row-host';
          host.innerText = r.hostname;
          text.appendChild(host);
        }
        li.appendChild(text);

        if (r.unavailable) {
          li.className = 'unavailable';
          li.setAttribute('aria-disabled', 'true');
          // Swallow the click rather than leaving it inert: without this the
          // row falls through to the document handler, which just closes the
          // list and looks like the pick was accepted.
          li.addEventListener('mousedown', function (e) { e.preventDefault(); });
        } else {
          // mousedown beats the input's blur so selection lands before hide.
          li.addEventListener('mousedown', function (e) { e.preventDefault(); selectInstance(r); });
          li.addEventListener('mousemove', function () { setActive(i); });
        }
        resultsList.appendChild(li);
      });
      resultsList.hidden = false;
    }

    function showLoading() {
      resultsList.innerHTML = '';
      currentRows = [];
      activeIndex = -1;
      var li = document.createElement('li');
      li.className = 'loading';
      li.innerText = 'Searching…';
      resultsList.appendChild(li);
      resultsList.hidden = false;
    }

    async function runSearch(query) {
      var epoch = ++searchEpoch;
      showLoading();
      var res;
      try {
        res = await callTool('search_mycharts', { query: query, limit: 8 });
      } catch (err) {
        if (epoch !== searchEpoch) return;
        res = null;
      }
      if (epoch !== searchEpoch) return; // a newer query is in flight; drop this response
      var matches = (res && Array.isArray(res.matches)) ? res.matches : [];
      // A typed address the directory already lists is just that listing.
      var host = hostFromQuery(query);
      if (host && !matches.some(function (m) { return m.hostname === host; })) {
        matches = matches.concat([{ hostname: host, name: 'Use ' + host, custom: true }]);
      }
      renderRows(matches, 'No matching health systems. Not listed? Type your MyChart web address, e.g. mychart.example.org.');
    }

    searchInput.addEventListener('input', function () {
      var q = searchInput.value.trim();
      if (searchDebounce) clearTimeout(searchDebounce);
      // Nothing is shown until the user actually types a query — no default
      // suggestions on focus/empty.
      if (!q) {
        searchEpoch++; // invalidate any in-flight response
        hideResults();
        return;
      }
      searchDebounce = setTimeout(function () { runSearch(q); }, 180);
    });

    searchInput.addEventListener('focus', function () {
      // Re-open existing results if the user refocuses a non-empty query;
      // an empty box stays closed.
      if (searchInput.value.trim() && currentRows.length) resultsList.hidden = false;
    });

    searchInput.addEventListener('keydown', function (e) {
      if (resultsList.hidden) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive(nextSelectable(activeIndex, 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive(nextSelectable(activeIndex, -1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        var idx = activeIndex >= 0 ? activeIndex : nextSelectable(-1, 1);
        if (currentRows[idx] && !currentRows[idx].unavailable) selectInstance(currentRows[idx]);
      } else if (e.key === 'Escape') {
        hideResults();
      }
    });

    document.addEventListener('mousedown', function (e) {
      if (!searchInput.parentElement.contains(e.target)) hideResults();
    });

    // ── Step transitions ────────────────────────────────────────────────────
    function selectInstance(r, username) {
      importing = false;
      // A typed address carries 'Use <host>' as its row label; past the picker
      // it is named by the host alone.
      selectedInstance = r.custom ? { hostname: r.hostname, name: r.hostname } : r;
      hideResults();

      fillHeader(instanceLogo, instanceName, selectedInstance);
      // A sign-in reached from an import goes back to the list it came from.
      backBtn.innerText = r.fromImport ? '‹ Back' : '‹ Change health system';

      // Reset credential state for a clean sign-in step.
      pendingId = null;
      usernameInput.value = username || '';
      passwordInput.value = '';
      twoFaInput.value = '';
      setIdle(submitBtn, 'Connect Account');
      clearError(credsError);
      hideStatus();

      showStep('creds');
      (username ? passwordInput : usernameInput).focus();
    }

    function goToPicker() {
      importing = false;
      selectedInstance = null;
      pendingId = null;
      hideStatus();
      showStep('picker');
      searchInput.focus();
    }

    var hostFromQuery = ${typedHostname};
    var deliveryLabel = ${twoFaDeliveryLabel};

    // Move to the dedicated 2FA step once a login reports need_2fa.
    function showTwoFa(delivery) {
      fillHeader(instanceLogo2fa, instanceName2fa, selectedInstance || {});
      var label = deliveryLabel(delivery);
      twoFaHint.innerText = label
        ? 'Enter the 6-digit code sent to ' + label + ' to finish signing in.'
        : 'Enter the 6-digit verification code to finish signing in.';
      twoFaInput.value = '';
      setIdle(verifyBtn, 'Verify Code');
      clearError(twoFaError);
      showStep('twofa');
      twoFaInput.focus();
    }

    backBtn.onclick = function () {
      if (selectedInstance && selectedInstance.fromImport) showAccounts();
      else goToPicker();
    };

    // Going back from 2FA drops the pending login. A manual sign-in returns to
    // its credentials, so re-submitting starts a fresh attempt; an imported one
    // has no credentials step, so it returns to the list of logins.
    back2faBtn.onclick = function () {
      pendingId = null;
      if (importing) { showAccounts(); return; }
      hideStatus();
      clearError(credsError);
      setIdle(submitBtn, 'Connect Account');
      showStep('creds');
      passwordInput.focus();
    };

    // Logged in (with or without 2FA). The login tool recommends a passkey
    // rather than registering one, and this widget is the recommended setup
    // path — so it makes the offer itself, on its own step, and registers only
    // when the user clicks. Compared against false rather than negated: a
    // result missing the field is not a result saying there is no passkey.
    function showSuccess(account, result) {
      if (result && result.passkey_saved === false) showPasskeyOffer(account, result);
      else accountDone(account, result && result.passkey_saved === true ? 'saved' : null);
    }

    function showPasskeyOffer(account, result) {
      connectedAccount = account;
      hideStatus();
      // Where the key lands is the server's live answer (keystore or the
      // 0600-file fallback), never a promise the widget makes on its own.
      passkeyStorage.innerText = result.passkey_storage_description || 'your OS keystore';
      passkeyInstance.innerText = (selectedInstance && selectedInstance.name) || 'MyChart';
      setIdle(registerPasskeyBtn, 'Set up passkey');
      skipPasskeyBtn.disabled = false;
      clearError(passkeyError);
      showStep('passkey');
      registerPasskeyBtn.focus();
    }

    // passkey: 'registered' — this widget just saved one; 'saved' — one was
    // already on file; null — none, the user skipped the offer. Either route
    // then lands on the list, which asks whether to connect another.
    function accountDone(account, passkey) {
      if (account) {
        connected = connected.filter(function (c) { return c.account.toLowerCase() !== account.toLowerCase(); });
        connected.push({ name: (selectedInstance && selectedInstance.name) || account, account: account, passkey: passkey });
      }
      connectedAccount = null;
      showAccounts();
    }

    doneBtn.onclick = function () {
      if (!connected.length) return;
      showStep('done');
      successHost.innerText = connected.map(function (o) { return o.account; }).join(', ');
      successCard.classList.add('visible');
      // ui/message injects a user-role message so Claude resumes the original
      // task. The passkey offer has already been made here, so the message
      // reports how it went rather than asking Claude to make it again.
      rpc('ui/message', {
        role: 'user',
        content: [{ type: 'text', text: setupDoneMessage(connected) }],
      }).catch(function (err) {
        // Non-fatal — the visual confirmation still appears.
        // eslint-disable-next-line no-console
        console.error('ui/message failed:', err && err.message ? err.message : err);
      });
    };

    // ── Sign in by hand → run the login scrapers ────────────────────────────
    submitBtn.onclick = async function () {
      if (!selectedInstance) { goToPicker(); return; }
      var hostname = selectedInstance.hostname;
      var username = usernameInput.value;
      var password = passwordInput.value;

      var missingUser = !username;
      var missingPass = !password;
      if (missingUser || missingPass) {
        showError(
          credsError,
          missingUser && missingPass ? 'Enter your username and password.'
            : missingUser ? 'Enter your username.'
            : 'Enter your password.',
        );
        (missingUser ? usernameInput : passwordInput).focus();
        return;
      }

      clearError(credsError);
      setBusy(submitBtn, 'Connecting...');

      try {
        var result = await callTool('setup_account', { hostname: hostname, username: username, password: password });

        if (result.state === 'need_2fa') {
          // Only now do we know 2FA is required → advance to the 2FA step.
          pendingId = result.pending_id;
          setIdle(submitBtn, 'Connect Account');
          showTwoFa(result.delivery || null);
        } else if (result.state === 'logged_in') {
          showSuccess(result.account || hostname, result);
        } else if (result.state === 'invalid_login') {
          showError(credsError, 'Invalid username or password. Please check your credentials.');
          setIdle(submitBtn, 'Connect Account');
        } else {
          showError(credsError, errorText(result, 'Login failed. Please try again.'));
          setIdle(submitBtn, 'Connect Account');
        }
      } catch (e) {
        showError(credsError, 'Error: ' + (e && e.message ? e.message : e));
        setIdle(submitBtn, 'Connect Account');
      }
    };

    // ── Submit the 2FA code → finish the login flow ─────────────────────────
    verifyBtn.onclick = async function () {
      if (!pendingId) { back2faBtn.onclick(); return; }
      var code = (twoFaInput.value || '').trim();
      if (code.length < 6) {
        showError(twoFaError, 'Enter the 6-digit verification code.');
        twoFaInput.focus();
        return;
      }

      clearError(twoFaError);
      setBusy(verifyBtn, 'Verifying...');

      try {
        var result = await callTool('complete_2fa', { pending_id: pendingId, code: code });
        if (result.state === 'logged_in') {
          showSuccess(result.account || (selectedInstance && selectedInstance.hostname), result);
        } else if (result.state === 'invalid_2fa') {
          showError(twoFaError, 'Invalid verification code. Please try again.');
          pendingId = result.pending_id; // refreshed pending id
          setIdle(verifyBtn, 'Verify Code');
          twoFaInput.focus();
        } else {
          showError(twoFaError, errorText(result, 'Unexpected state: ' + (result && result.state)));
          setIdle(verifyBtn, 'Verify Code');
        }
      } catch (e) {
        showError(twoFaError, 'Error: ' + (e && e.message ? e.message : e));
        setIdle(verifyBtn, 'Verify Code');
      }
    };

    // ── Register a passkey on the just-connected account ────────────────────
    registerPasskeyBtn.onclick = async function () {
      if (!connectedAccount) { showAccounts(); return; }
      clearError(passkeyError);
      setBusy(registerPasskeyBtn, 'Registering...');
      skipPasskeyBtn.disabled = true;

      try {
        var result = await callTool('register_passkey', { account: connectedAccount });
        if (result && result.registered === true) {
          accountDone(connectedAccount, 'registered');
          return;
        }
        // Some instances refuse passkey registration from the portal, and
        // that is the message they get. Skipping is still available beneath it.
        showError(passkeyError, errorText(typeof result === 'string' ? result : null, 'MyChart did not return a passkey.'));
      } catch (e) {
        showError(passkeyError, 'Error: ' + (e && e.message ? e.message : e));
      }
      skipPasskeyBtn.disabled = false;
      setIdle(registerPasskeyBtn, 'Try again');
    };

    skipPasskeyBtn.onclick = function () { accountDone(connectedAccount, null); };

    // Clear the inline error as soon as the user starts correcting the input.
    usernameInput.addEventListener('input', function () { clearError(credsError); });
    passwordInput.addEventListener('input', function () { clearError(credsError); });
    twoFaInput.addEventListener('input', function () { clearError(twoFaError); });

    // Submit on Enter from the relevant fields.
    passwordInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submitBtn.click(); } });
    twoFaInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); verifyBtn.click(); } });

    // Kick off the handshake immediately so the first interaction doesn't wait on it.
    ensureHandshake().then(function () {
      // Tell the host our real height so the iframe stops scrolling.
      var lastH = 0;
      var pending = 0;
      var reportSize = function () {
        var h = document.documentElement.scrollHeight;
        if (h === lastH) return;
        lastH = h;
        notify('ui/notifications/size-changed', { height: h });
      };
      var schedule = function () {
        if (pending) return;
        pending = requestAnimationFrame(function () { pending = 0; reportSize(); });
      };
      schedule();
      new ResizeObserver(schedule).observe(document.documentElement);
    }).catch(function (err) {
      showStatus('Could not connect to host: ' + (err && err.message ? err.message : err));
    });
  </script>
</body>
</html>
`;

/** The setup widget HTML, served as the ui://openrecord/setup resource. */
export function buildSetupUiHtml(): string {
  return SETUP_UI_TEMPLATE;
}
