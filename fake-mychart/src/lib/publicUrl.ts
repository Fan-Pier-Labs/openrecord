/**
 * The origin the *client* used, which is not the one `request.url` reports.
 *
 * Behind Docker Compose the container listens on 3000 and the port is
 * published as 4000, so `new URL(request.url).origin` is `localhost:3000` —
 * an address nothing outside the container can reach. Behind CloudFront it is
 * the container again rather than the public domain. Both are wrong in the
 * same way, and both surface the same way: an absolute URL this server hands
 * out (a redirect `Location`, a directory entry's `loginUrl`) points somewhere
 * the client can't follow.
 *
 * So take the host the client addressed, and the protocol the edge terminated.
 * A host with no dot, or an explicit localhost, is a local dev/CI server and
 * is plain http.
 */
export function publicProtocolAndHost(request: Request): { protocol: string; host: string } {
  const host = request.headers.get('host') || new URL(request.url).host;
  // CloudFront sets cloudfront-forwarded-proto; ALB sets x-forwarded-proto.
  const protocol =
    request.headers.get('cloudfront-forwarded-proto') ||
    request.headers.get('x-forwarded-proto') ||
    (host.includes('localhost') || !host.includes('.') ? 'http' : 'https');
  return { protocol, host };
}

/** `{@link publicProtocolAndHost}` as an origin, e.g. `http://localhost:4000`. */
export function publicBaseUrl(request: Request): string {
  const { protocol, host } = publicProtocolAndHost(request);
  return `${protocol}://${host}`;
}
