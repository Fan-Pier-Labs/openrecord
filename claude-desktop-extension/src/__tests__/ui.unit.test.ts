import { describe, expect, test } from 'bun:test';
import { buildSetupUiHtml, SETUP_UI_MIME_TYPE } from '../ui';

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
