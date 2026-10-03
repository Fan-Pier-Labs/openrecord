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
 * The setup widget HTML, served as the ui://openrecord/setup resource: the
 * bundled React app (src/setup-widget) inlined into one self-contained page.
 */
export function buildSetupUiHtml(widget: { js: string; css: string }): string {
  // An inline script ends at the first `</script`, even inside a JS string.
  // `<\/script` means the same thing everywhere it can appear in JS.
  const js = widget.js.replace(/<\/script/gi, '<\\/script');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Connect MyChart</title>
  <style>${widget.css}</style>
</head>
<body>
  <div id="root"></div>
  <script>${js}</script>
</body>
</html>
`;
}
