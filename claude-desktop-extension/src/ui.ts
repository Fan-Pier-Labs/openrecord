export const SETUP_UI_MIME_TYPE = 'text/html;profile=mcp-app';

/**
 * Interactive Setup Widget for OpenRecord.
 *
 * Served via the MCP Apps ui:// protocol. Step-based flow:
 *   1. Pick a health system from an autocomplete dropdown (results appear only
 *      after the user types; they must choose an entry — free-text hostnames
 *      are not accepted).
 *   2. Enter MyChart credentials for the chosen system; submitting fires the
 *      real login scrapers via setup_account.
 *   3. Two-step verification — only reached when setup_account reports
 *      need_2fa; the code is completed via complete_2fa.
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

    <!-- ── Step 1: pick a health system ───────────────────────────────── -->
    <div id="step-picker">
      <p class="step-sub">Search for your hospital or clinic, then pick it from the list.</p>
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
    // Featured suggestions (e.g. the fake-mychart test sandbox), injected at build time.
    var titleEl = document.getElementById('title');
    var statusDiv = document.getElementById('status');
    var stepPicker = document.getElementById('step-picker');
    var stepCreds = document.getElementById('step-creds');
    var stepTwoFa = document.getElementById('step-2fa');
    var searchInput = document.getElementById('search');
    var resultsList = document.getElementById('results');
    var backBtn = document.getElementById('back');
    var back2faBtn = document.getElementById('back-2fa');
    var instanceLogo = document.getElementById('instance-logo');
    var instanceName = document.getElementById('instance-name');
    var instanceLogo2fa = document.getElementById('instance-logo-2fa');
    var instanceName2fa = document.getElementById('instance-name-2fa');
    var twoFaHint = document.getElementById('twofa-hint');
    var usernameInput = document.getElementById('username');
    var passwordInput = document.getElementById('password');
    var twoFaInput = document.getElementById('2fa-code');
    var submitBtn = document.getElementById('submit');
    var verifyBtn = document.getElementById('verify');
    var credsError = document.getElementById('creds-error');
    var twoFaError = document.getElementById('twofa-error');
    var successCard = document.getElementById('success-card');
    var successHost = document.getElementById('success-host');

    var pendingId = null;
    var selectedInstance = null;
    var currentRows = [];
    var activeIndex = -1;

    var STEP_TITLES = {
      picker: 'Connect to MyChart',
      creds: 'Sign in to MyChart',
      twofa: 'Two-step verification',
    };

    function showStep(step) {
      stepPicker.hidden = step !== 'picker';
      stepCreds.hidden = step !== 'creds';
      stepTwoFa.hidden = step !== 'twofa';
      successCard.classList.remove('visible');
      titleEl.innerText = STEP_TITLES[step] || STEP_TITLES.picker;
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

    async function callTool(name, args) {
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

    // ── Step 1: health-system picker ────────────────────────────────────────
    var searchEpoch = 0;
    var searchDebounce = 0;

    function hideResults() {
      resultsList.hidden = true;
      resultsList.innerHTML = '';
      currentRows = [];
      activeIndex = -1;
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
        var host = document.createElement('span');
        host.className = 'row-host';
        host.innerText = r.hostname;
        text.appendChild(name);
        text.appendChild(host);
        li.appendChild(text);

        // mousedown beats the input's blur so selection lands before hide.
        li.addEventListener('mousedown', function (e) { e.preventDefault(); selectInstance(r); });
        li.addEventListener('mousemove', function () { setActive(i); });
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
        hideResults();
        return;
      }
      if (epoch !== searchEpoch) return; // a newer query is in flight; drop this response
      var matches = (res && Array.isArray(res.matches)) ? res.matches : [];
      renderRows(matches);
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
        if (currentRows.length) setActive((activeIndex + 1) % currentRows.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (currentRows.length) setActive((activeIndex - 1 + currentRows.length) % currentRows.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        var idx = activeIndex >= 0 ? activeIndex : 0;
        if (currentRows[idx]) selectInstance(currentRows[idx]);
      } else if (e.key === 'Escape') {
        hideResults();
      }
    });

    document.addEventListener('mousedown', function (e) {
      if (!searchInput.parentElement.contains(e.target)) hideResults();
    });

    // ── Step transitions ────────────────────────────────────────────────────
    function selectInstance(r) {
      selectedInstance = r;
      hideResults();

      fillHeader(instanceLogo, instanceName, r);

      // Reset credential state for a clean step 2.
      pendingId = null;
      usernameInput.value = '';
      passwordInput.value = '';
      twoFaInput.value = '';
      submitBtn.disabled = false;
      submitBtn.innerText = 'Connect Account';
      clearError(credsError);
      hideStatus();

      showStep('creds');
      usernameInput.focus();
    }

    function goToPicker() {
      selectedInstance = null;
      pendingId = null;
      hideStatus();
      showStep('picker');
      searchInput.focus();
    }

    // Move to the dedicated 2FA step once setup_account reports need_2fa.
    function showTwoFa(delivery) {
      fillHeader(instanceLogo2fa, instanceName2fa, selectedInstance || {});
      twoFaHint.innerText = delivery
        ? 'Enter the 6-digit code sent to ' + delivery + ' to finish signing in.'
        : 'Enter the 6-digit verification code to finish signing in.';
      twoFaInput.value = '';
      verifyBtn.disabled = false;
      verifyBtn.innerText = 'Verify Code';
      clearError(twoFaError);
      showStep('twofa');
      twoFaInput.focus();
    }

    backBtn.onclick = goToPicker;

    // Going back from 2FA returns to credentials; the pending login is dropped,
    // so re-submitting starts a fresh login attempt.
    back2faBtn.onclick = function () {
      pendingId = null;
      hideStatus();
      clearError(credsError);
      submitBtn.disabled = false;
      submitBtn.innerText = 'Connect Account';
      showStep('creds');
      passwordInput.focus();
    };

    function showSuccess(account, result) {
      hideStatus();
      stepPicker.hidden = true;
      stepCreds.hidden = true;
      stepTwoFa.hidden = true;
      successHost.innerText = account ? 'Linked to ' + account : '';
      successCard.classList.add('visible');
      // ui/message injects a user-role message so Claude resumes the original
      // task immediately — the user doesn't have to type anything.
      var hostMsg = account
        ? 'My MyChart account at ' + account + ' is now connected. Please continue with my original request.'
        : 'My MyChart account is now connected. Please continue with my original request.';
      // The login tool recommends a passkey rather than registering one, and
      // this widget is the recommended setup path — so carry the recommendation
      // into the conversation instead of letting the GUI route swallow it.
      if (result && result.passkey_recommended) {
        hostMsg += ' First, though: tell me whether you recommend setting up a passkey for this account,' +
          ' what it changes about how I sign in, and where the key is stored — then wait for my answer' +
          ' before registering anything.';
      }
      rpc('ui/message', {
        role: 'user',
        content: [{ type: 'text', text: hostMsg }],
      }).catch(function (err) {
        // Non-fatal — the visual confirmation still appears.
        // eslint-disable-next-line no-console
        console.error('ui/message failed:', err && err.message ? err.message : err);
      });
    }

    // ── Step 2: submit credentials → run the login scrapers ─────────────────
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
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="loader"></span> Connecting...';

      try {
        var result = await callTool('setup_account', { hostname: hostname, username: username, password: password });

        if (result.state === 'need_2fa') {
          // Only now do we know 2FA is required → advance to the 2FA step.
          pendingId = result.pending_id;
          submitBtn.disabled = false;
          submitBtn.innerText = 'Connect Account';
          showTwoFa(result.delivery || result.target || null);
        } else if (result.state === 'logged_in') {
          showSuccess(result.account || hostname, result);
        } else if (result.state === 'invalid_login') {
          showError(credsError, 'Invalid username or password. Please check your credentials.');
          submitBtn.disabled = false;
          submitBtn.innerText = 'Connect Account';
        } else {
          showError(credsError, result.message || 'Login failed. Please try again.');
          submitBtn.disabled = false;
          submitBtn.innerText = 'Connect Account';
        }
      } catch (e) {
        showError(credsError, 'Error: ' + (e && e.message ? e.message : e));
        submitBtn.disabled = false;
        submitBtn.innerText = 'Connect Account';
      }
    };

    // ── Step 3: submit the 2FA code → finish the login flow ─────────────────
    verifyBtn.onclick = async function () {
      if (!pendingId) { back2faBtn.onclick(); return; }
      var code = (twoFaInput.value || '').trim();
      if (code.length < 6) {
        showError(twoFaError, 'Enter the 6-digit verification code.');
        twoFaInput.focus();
        return;
      }

      clearError(twoFaError);
      verifyBtn.disabled = true;
      verifyBtn.innerHTML = '<span class="loader"></span> Verifying...';

      try {
        var result = await callTool('complete_2fa', { pending_id: pendingId, code: code });
        if (result.state === 'logged_in') {
          showSuccess(result.account || (selectedInstance && selectedInstance.hostname), result);
        } else if (result.state === 'invalid_2fa') {
          showError(twoFaError, 'Invalid verification code. Please try again.');
          pendingId = result.pending_id; // refreshed pending id
          verifyBtn.disabled = false;
          verifyBtn.innerText = 'Verify Code';
          twoFaInput.focus();
        } else {
          showError(twoFaError, result.message || ('Unexpected state: ' + result.state));
          verifyBtn.disabled = false;
          verifyBtn.innerText = 'Verify Code';
        }
      } catch (e) {
        showError(twoFaError, 'Error: ' + (e && e.message ? e.message : e));
        verifyBtn.disabled = false;
        verifyBtn.innerText = 'Verify Code';
      }
    };

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
