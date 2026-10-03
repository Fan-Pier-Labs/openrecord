import { describe, expect, test } from 'bun:test';
import { bundleSetupWidget } from '../../scripts/bundle-setup-widget';
import { buildSetupUiHtml, SETUP_UI_MIME_TYPE, SETUP_UI_RESOURCE_META } from '../ui';
import { MYCHART_MEDIA_ORIGIN } from '../../../scrapers/list-all-mycharts/directory';
import { SANDBOX_INSTANCE } from '../../../scrapers/list-all-mycharts/searchDirectory';
import bundledInstances from '../../../scrapers/list-all-mycharts/mychart-instances.json';

describe('buildSetupUiHtml', () => {
  test('serves the MCP Apps mime type', () => {
    expect(SETUP_UI_MIME_TYPE).toBe('text/html;profile=mcp-app');
  });

  test('inlines the bundled widget into one self-contained page', async () => {
    const widget = await bundleSetupWidget();
    // React's production build, not its development one.
    expect(widget.js).not.toContain('development');
    expect(widget.css).toContain('.instance-header');
    const html = buildSetupUiHtml(widget);
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain(`<style>${widget.css}</style>`);
    // No external script or stylesheet: the sandboxed iframe's CSP would block it.
    expect(html).not.toMatch(/<script[^>]+src=|<link/);
  }, 30_000);

  test('a "</script" inside the bundle cannot end the inline script early', () => {
    const html = buildSetupUiHtml({ js: 'const s = "</script><b>";', css: '' });
    expect(html.match(/<\/script/g)).toHaveLength(1);
    expect(html).toContain('const s = "<\\/script><b>";');
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
