import { describe, expect, test } from 'bun:test';
import { buildSetupUiHtml, SETUP_UI_MIME_TYPE, SETUP_UI_RESOURCE_META } from '../ui';
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

  test('does not show default picker suggestions (no featured list)', () => {
    const html = buildSetupUiHtml();
    expect(html).not.toContain('__FEATURED_JSON__');
    expect(html).not.toContain('FEATURED');
    // Empty/focus state hides results rather than rendering a default list.
    expect(html).toContain('hideResults();');
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
