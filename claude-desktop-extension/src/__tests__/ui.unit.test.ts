import { describe, expect, test } from 'bun:test';
import { buildSetupUiHtml, SETUP_UI_MIME_TYPE, twoFaDeliveryLabel } from '../ui';

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

  test('does not show default picker suggestions (no featured list)', () => {
    const html = buildSetupUiHtml();
    expect(html).not.toContain('__FEATURED_JSON__');
    expect(html).not.toContain('FEATURED');
    // Empty/focus state hides results rather than rendering a default list.
    expect(html).toContain('hideResults();');
  });
});
