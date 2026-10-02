import { describe, expect, test } from 'bun:test';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { buildSetupUiHtml, parkedCallId, setupDoneMessage, SETUP_UI_MIME_TYPE, SETUP_UI_RESOURCE_META, twoFaDeliveryLabel } from '../ui';
import { checkPendingCall, resetPendingCalls, runGuarded } from '../pending-call';
import { MYCHART_MEDIA_ORIGIN } from '../../../scrapers/list-all-mycharts/directory';
import { SANDBOX_INSTANCE } from '../../../scrapers/list-all-mycharts/searchDirectory';
import bundledInstances from '../../../scrapers/list-all-mycharts/mychart-instances.json';

describe('buildSetupUiHtml', () => {
  test('serves the MCP Apps mime type', () => {
    expect(SETUP_UI_MIME_TYPE).toBe('text/html;profile=mcp-app');
  });

  test('renders all three setup steps', () => {
    const html = buildSetupUiHtml();
    // Step 1: health-system picker.
    expect(html).toContain('id="step-picker"');
    // Step 2: chosen instance logo + username/password fields.
    expect(html).toContain('id="step-creds"');
    expect(html).toContain('id="instance-logo"');
    expect(html).toContain('id="username"');
    expect(html).toContain('id="password"');
    // Step 3: dedicated 2FA code entry (only reached when need_2fa).
    expect(html).toContain('id="step-2fa"');
    expect(html).toContain('id="2fa-code"');
    expect(html).toContain('id="verify"');
  });

  test('opens on a choice between importing from the browser and typing it in', () => {
    const html = buildSetupUiHtml();
    expect(html).toContain('<div id="step-choose">');
    expect(html).toContain('id="choose-import"');
    expect(html).toContain('id="choose-manual"');
    // Every other step starts hidden, so the choice is the first thing shown.
    for (const step of ['consent', 'found', 'connecting', 'picker', 'creds', '2fa', 'passkey', 'summary']) {
      expect(html).toContain(`<div id="step-${step}" hidden>`);
    }
  });

  test('scans the browser only after the user allows it on the permission step', () => {
    const html = buildSetupUiHtml();
    expect(html).toContain('id="step-consent"');
    // The scan lives in the permission button's handler and nowhere else.
    expect(html.split("callTool('import_browser_passwords'")).toHaveLength(2);
    const scanHandler = html.slice(html.indexOf('scanBtn.onclick'));
    expect(scanHandler.indexOf("callTool('import_browser_passwords'")).toBeLessThan(scanHandler.indexOf('function showFound'));
  });

  test('connects only the logins the user ticked, by import id', () => {
    const html = buildSetupUiHtml();
    // An already-connected login or one without a username starts unticked and can't be picked.
    expect(html).toContain('box.checked = !f.note;');
    expect(html).toContain('box.disabled = !!f.note;');
    expect(html).toContain("callTool('connect_imported_account', { import_id: entry.import_id })");
    // A rejected saved password lands on the summary with a way to type it instead.
    expect(html).toContain("retry.innerText = 'Enter password'");
  });

  test('hands back to the chat only when the user clicks Done', () => {
    const html = buildSetupUiHtml();
    expect(html).toContain('id="done"');
    expect(html.split("rpc('ui/message'")).toHaveLength(2);
    expect(html.slice(html.indexOf('doneBtn.onclick')).indexOf("rpc('ui/message'")).toBeGreaterThan(0);
    expect(html).toContain('var setupDoneMessage = function setupDoneMessage');
  });

  test('offers a passkey on its own step and registers only on click', () => {
    const html = buildSetupUiHtml();
    // Step 4: reached from either login route when passkey_saved is false.
    expect(html).toContain('id="step-passkey"');
    expect(html).toContain('result.passkey_saved === false) showPasskeyOffer(');
    // Where the key lands comes from the server, not a promise the widget makes.
    expect(html).toContain('result.passkey_storage_description');
    // A button and a way out; the tool call is inside the click handler only.
    expect(html).toContain('id="register-passkey"');
    expect(html).toContain('id="skip-passkey"');
    expect(html).toContain('id="passkey-error"');
    expect(html.split("callTool('register_passkey'")).toHaveLength(2);
    // The conversation is told the outcome, never asked to re-offer.
    expect(html).not.toContain('tell me whether you recommend setting up a passkey');
    expect(html).toContain('so do not offer one again');
  });

  test('reports every connected account and how its passkey offer went', () => {
    expect(setupDoneMessage([{ account: 'homer@mychart.example.org', passkey: 'registered' }])).toBe(
      'My MyChart account homer@mychart.example.org is now connected. A passkey is now saved for homer@mychart.example.org. Please continue with my original request.',
    );
    expect(
      setupDoneMessage([
        { account: 'a@one.example.org', passkey: null },
        { account: 'b@two.example.org', passkey: 'saved' },
        { account: 'c@three.example.org', passkey: null },
      ]),
    ).toBe(
      'I connected 3 MyChart accounts: a@one.example.org, b@two.example.org, c@three.example.org. ' +
        'I chose not to set up a passkey for a@one.example.org, c@three.example.org right now, so do not offer one again. ' +
        'Please continue with my original request.',
    );
  });

  test('keeps the hidden attribute authoritative over flex layout', () => {
    // .field { display:flex } would otherwise beat the UA [hidden] rule, so a
    // global [hidden]{display:none!important} must be present.
    expect(buildSetupUiHtml()).toContain('[hidden] { display: none !important; }');
  });

  test('has inline error labels beneath each action button', () => {
    const html = buildSetupUiHtml();
    expect(html).toContain('id="creds-error"');
    expect(html).toContain('id="twofa-error"');
    expect(html).toContain('class="field-error"');
  });

  test('names the 2FA target instead of stringifying the delivery object', () => {
    // setup_account returns `{ method, contact }`; concatenating it straight
    // into the hint rendered "sent to [object Object]".
    expect(twoFaDeliveryLabel({ method: 'sms', contact: '***-***-1234' })).toBe('***-***-1234');
    // MyChart often reports the method with no masked contact.
    expect(twoFaDeliveryLabel({ method: 'sms' })).toBe('your phone');
    expect(twoFaDeliveryLabel({ method: 'email' })).toBe('your email');
    // No usable target falls back to the generic hint.
    expect(twoFaDeliveryLabel({})).toBeNull();
    expect(twoFaDeliveryLabel(null)).toBeNull();
    // The widget calls the same function, injected by source.
    expect(buildSetupUiHtml()).toContain('var deliveryLabel = function twoFaDeliveryLabel');
  });

  test('greys out an entry search_mycharts marked unavailable rather than dropping it', () => {
    // The test sandbox gets torn down when it isn't worth its bill, and the
    // live MCPB kept offering it — people picked it and hit a login that could
    // never succeed. The row stays visible, carrying the reason, but nothing
    // in the picker can select it.
    const html = buildSetupUiHtml();
    expect(html).toContain("li.className = 'unavailable'");
    expect(html).toContain("li.setAttribute('aria-disabled', 'true')");
    expect(html).toContain('.results li.unavailable {');
    // The reason replaces the hostname line, so the row explains itself.
    expect(html).toContain("note.className = 'row-unavailable'");
    expect(html).toContain('note.innerText = r.unavailable;');
    // Neither click nor Enter can pick it, and arrows step over it.
    expect(html).toContain('!currentRows[idx].unavailable) selectInstance(');
    expect(html).toContain('function nextSelectable(from, step)');
    expect(html).toContain('if (!currentRows[idx].unavailable) return idx;');
  });

  test('does not show default picker suggestions (no featured list)', () => {
    const html = buildSetupUiHtml();
    expect(html).not.toContain('__FEATURED_JSON__');
    expect(html).not.toContain('FEATURED');
    // Empty/focus state hides results rather than rendering a default list.
    expect(html).toContain('hideResults();');
  });
});

describe('parkedCallId', () => {
  // The widget waits out a parked call (a browser scan sitting on the keychain
  // prompt) by reading the id from the real notes, so test against those.
  const text = (r: CallToolResult) => (r.content[0] as { text: string }).text;

  test('reads the id from the parking note and from a still-running check', async () => {
    resetPendingCalls();
    const never = new Promise<CallToolResult>(() => {});
    const parked = text(await runGuarded('import_browser_passwords', {}, () => never, 1));
    const id = parkedCallId(parked);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(parkedCallId(text(await checkPendingCall({ id: id!, wait: false })))).toBe(id);
    resetPendingCalls();
  });

  test('ignores a finished result', () => {
    expect(parkedCallId({ supported: true, accounts: [] })).toBeNull();
    expect(parkedCallId('Error: something else')).toBeNull();
    expect(parkedCallId(undefined)).toBeNull();
  });
});

describe('SETUP_UI_RESOURCE_META', () => {
  // The host builds the widget's sandbox CSP from this and defaults every
  // directive to 'none', so an origin missing here is a broken logo, not a
  // console warning.
  const domains: readonly string[] = SETUP_UI_RESOURCE_META.ui.csp.resourceDomains;

  test('allows every origin the bundled directory serves a logo from', () => {
    const origins = new Set(
      (bundledInstances as { logoUrl: string }[]).map(i => new URL(i.logoUrl).origin),
    );
    expect(origins.size).toBeGreaterThan(0);
    for (const origin of origins) expect(domains).toContain(origin);
    expect(domains).toContain(MYCHART_MEDIA_ORIGIN);
  });

  test("allows the sandbox entry's inline logo", () => {
    expect(SANDBOX_INSTANCE.logoUrl.startsWith('data:')).toBe(true);
    expect(domains).toContain('data:');
  });
});
