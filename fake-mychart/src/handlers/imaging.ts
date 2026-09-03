import { json } from './respond';
import { prefix, type PatternRoute } from './types';

/** FdiData — the bridge from MyChart to the eUnity image viewer. */
export const imagingPostPatterns: readonly PatternRoute[] = [
  prefix('extensibility/redirection/fdidata', ({ request }) => {
    const url = new URL(request.url);
    // Prefer x-forwarded-host, then Host; ignore localhost values that
    // sneak in when Next.js runs behind a load balancer. Force https only
    // for real external hostnames (dotted + non-localhost); Docker service
    // names like "fake-mychart:3000" must stay http.
    const forwardedHost = request.headers.get('x-forwarded-host');
    const hostHeader = request.headers.get('host');
    const isLocalHost = (h: string | null) =>
      !!h && /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|$)/.test(h);
    const host =
      forwardedHost ||
      (hostHeader && !isLocalHost(hostHeader) ? hostHeader : null) ||
      url.host;
    const hostName = host.split(':')[0] ?? host;
    const isExternal = !isLocalHost(host) && hostName.includes('.');
    const proto = isExternal
      ? 'https'
      : (request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', ''));
    const origin = `${proto}://${host}`;
    // Determine which study based on the fdi parameter
    const fdi = url.searchParams.get('fdi') ?? '';
    const studyType = fdi.includes('CT') ? 'ct' : 'xray';
    return json({
      url: `${origin}/e/saml-sts?study=${studyType}`,
      launchmode: 2,
      IsFdiPost: false,
    });
  }),
];
