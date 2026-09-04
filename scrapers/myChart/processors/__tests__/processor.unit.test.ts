import { describe, it, expect, mock } from 'bun:test';
import { MyChartRequest } from '../../core/myChartRequest';
import { RawCollector, MyChartResponseError, unwrapRaw, findRequest, findRequests, bodyOf, displayPath } from '../../core/rawResponse';
import { renderOutput, passthroughProcessor, isOutputMode, OUTPUT_MODES, type Processor } from '../processor';
import { rec, list, text, textOrNull, bool, num, strings, epicInstantMs, isoFromMs } from '../read';

type MockReply = { body: string; status?: number; contentType?: string; url?: string; location?: string };

function mockRequest(responses: MockReply[]) {
  const req = new MyChartRequest('mychart.example.com');
  req.firstPathPart = 'MyChart';
  let i = 0;
  req.transport = mock(async () => {
    const r = responses[i++]!;
    const response = new Response(r.body, {
      status: r.status ?? 200,
      headers: {
        'content-type': r.contentType ?? 'application/json',
        ...(r.location ? { location: r.location } : {}),
      },
    });
    // A constructed Response has no url; a fetched one reports where it came
    // from, which is the only trace of a followed redirect.
    if (r.url) Object.defineProperty(response, 'url', { value: r.url });
    return response;
  });
  return req;
}

describe('RawCollector', () => {
  it('records each request with its parsed body, minus the cache-buster', async () => {
    const req = mockRequest([
      { body: '<html><input name="__RequestVerificationToken" value="t"></html>', contentType: 'text/html' },
      { body: JSON.stringify({ dataList: [] }) },
    ]);
    const collector = new RawCollector(req);
    const page = await collector.send({ path: '/Clinical/Allergies?noCache=0.123' });
    expect(typeof page.body).toBe('string');
    const api = await collector.send({
      path: '/api/allergies/LoadAllergies',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a: 1 }),
    });
    expect(api.body).toEqual({ dataList: [] });

    const raw = collector.toRaw();
    expect(raw.requests).toHaveLength(2);
    expect(raw.requests[0]).toMatchObject({ path: '/Clinical/Allergies', method: 'GET', status: 200 });
    expect(raw.requests[0]!.requestBody).toBeUndefined();
    expect(raw.requests[1]).toMatchObject({
      path: '/api/allergies/LoadAllergies',
      method: 'POST',
      requestBody: { a: 1 },
      body: { dataList: [] },
    });
  });

  it('keeps a non-JSON body as text and a form body as the string it was', async () => {
    const req = mockRequest([{ body: 'Not JSON at all', contentType: 'text/html' }]);
    const collector = new RawCollector(req);
    await collector.send({
      path: '/x',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'a=1',
    });
    expect(collector.requests[0]!.body).toBe('Not JSON at all');
    expect(collector.requests[0]!.requestBody).toBe('a=1');
  });

  it('records a JSON body that failed to parse as the string it was', async () => {
    const req = mockRequest([{ body: '{}' }]);
    const collector = new RawCollector(req);
    await collector.send({ path: '/x', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json' });
    expect(collector.requests[0]!.requestBody).toBe('{not json');
  });
});

/**
 * A failed answer must never reach a processor as data. Before this, a 500
 * was recorded, `rec(html)` read it as `{}`, and concise mode rendered "no
 * allergies on file".
 */
describe('RawCollector failed answers', () => {
  const ERROR_PAGE = '<!DOCTYPE html><html><head><title>Error</title></head><body><h1>An error has occurred.</h1><p>Please try again later.</p></body></html>';

  it('throws on a 5xx, after recording it, with the status and what the page said', async () => {
    const req = mockRequest([{ body: ERROR_PAGE, status: 500, contentType: 'text/html; charset=utf-8' }]);
    const collector = new RawCollector(req);
    const error = await collector
      .send({ path: '/api/allergies/LoadAllergies', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then(() => null, (e: unknown) => e as MyChartResponseError);
    expect(error).toBeInstanceOf(MyChartResponseError);
    expect(error!.status).toBe(500);
    expect(error!.path).toBe('/api/allergies/LoadAllergies');
    expect(error!.message).toContain('POST /api/allergies/LoadAllergies with HTTP 500 (text/html; charset=utf-8)');
    expect(error!.message).toContain('An error has occurred. Please try again later.');
    expect(error!.message).not.toContain('<h1>');
    // The answer is still in the envelope for whoever catches this.
    expect(collector.requests).toHaveLength(1);
    expect(collector.requests[0]).toMatchObject({ status: 500, body: ERROR_PAGE });
  });

  it('throws on a 4xx too — a Cloudflare challenge is a 403 with a page, not an empty chart', async () => {
    const req = mockRequest([{ body: '<html><title>Just a moment...</title></html>', status: 403, contentType: 'text/html' }]);
    await expect(new RawCollector(req).send({ path: '/api/x' })).rejects.toThrow(/HTTP 403/);
  });

  it('throws on a token page that failed, with the status rather than "no token"', async () => {
    const req = mockRequest([{ body: ERROR_PAGE, status: 500, contentType: 'text/html' }]);
    await expect(new RawCollector(req).pageToken('/Clinical/Allergies')).rejects.toThrow(/GET \/Clinical\/Allergies with HTTP 500/);
  });

  it('throws on a 200 that came from the ASP.NET error page — the November 2025 redirect dance', async () => {
    // 302 /Home/FiveHundred → 302 /Home/Error?code=14 → 200: after the
    // redirects are followed, the status is fine and only the URL tells.
    const req = mockRequest([
      { body: ERROR_PAGE, status: 200, contentType: 'text/html; charset=utf-8', url: 'https://mychart.example.com/MyChart/Home/Error?code=14' },
    ]);
    const collector = new RawCollector(req);
    await expect(collector.send({ path: '/api/allergies/LoadAllergies', method: 'POST' })).rejects.toThrow(
      /HTTP 200 from its error page https:\/\/mychart\.example\.com\/MyChart\/Home\/Error\?code=14/,
    );
    expect(collector.requests[0]).toMatchObject({ status: 200 });
  });

  it('does not mistake an ordinary page for the error page', async () => {
    const req = mockRequest([
      { body: '<html>home</html>', contentType: 'text/html', url: 'https://mychart.example.com/MyChart/Home/ErrorFree' },
      { body: '<html>ok</html>', contentType: 'text/html', url: 'https://mychart.example.com/MyChart/Clinical/Allergies' },
    ]);
    const collector = new RawCollector(req);
    await collector.send({ path: '/Home/ErrorFree' });
    await collector.send({ path: '/Clinical/Allergies' });
    expect(collector.requests).toHaveLength(2);
  });

  it('throws on an F5 block page, which is a 200 with "Request Rejected" where the data belongs', async () => {
    const req = mockRequest([
      { body: '<html><head><title>Request Rejected</title></head><body>The requested URL was rejected. Your support ID is: 123</body></html>', contentType: 'text/html' },
    ]);
    await expect(new RawCollector(req).send({ path: '/api/x', method: 'POST' })).rejects.toThrow(/WAF block page.*rejected/);
  });

  it('reads a redirect a caller asked to see for itself, unless it points at the error page', async () => {
    const req = mockRequest([
      { body: '', status: 302, contentType: 'text/html', location: '/MyChart/Home/Landing' },
      { body: '', status: 302, contentType: 'text/html', location: '/MyChart/Home/FiveHundred?aspxerrorpath=/MyChart/api/x' },
    ]);
    const collector = new RawCollector(req);
    const seen = await collector.send({ path: '/Home', followRedirects: false });
    expect(seen.response.status).toBe(302);
    expect(seen.failure).toBeNull();
    await expect(collector.send({ path: '/api/x', followRedirects: false })).rejects.toThrow(/HTTP 302 to its error page/);
  });

  it('tolerateFailure records the answer and hands back the failure instead of throwing', async () => {
    const req = mockRequest([{ body: 'server error', status: 500, contentType: 'text/plain' }]);
    const collector = new RawCollector(req);
    const result = await collector.send({ path: '/Clinical/CareTeam/LoadExternal', method: 'POST' }, { tolerateFailure: true });
    expect(result.failure).toBeInstanceOf(MyChartResponseError);
    expect(result.body).toBe('server error');
    expect(collector.requests[0]).toMatchObject({ status: 500, body: 'server error' });

    const ok = await new RawCollector(mockRequest([{ body: '{}' }])).send({ path: '/x' });
    expect(ok.failure).toBeNull();
  });

  it('postJson forwards the option', async () => {
    const req = mockRequest([
      { body: '{"Message":"An error has occurred."}', status: 500 },
      { body: '{"Message":"An error has occurred."}', status: 500 },
    ]);
    const collector = new RawCollector(req);
    await expect(collector.postJson('/api/x', 't', {})).rejects.toThrow(/HTTP 500/);
    expect(await collector.postJson('/api/x', 't', {}, { tolerateFailure: true })).toEqual({ Message: 'An error has occurred.' });
    expect(collector.requests).toHaveLength(2);
  });
});

describe('raw envelope helpers', () => {
  const raw = {
    requests: [
      { path: '/app/test-results', method: 'GET' as const, status: 200, contentType: 'text/html', body: '<html>' },
      { path: '/api/test-results/GetDetails', method: 'POST' as const, status: 200, contentType: 'json', body: { key: 'A' } },
      { path: '/api/test-results/GetDetails', method: 'POST' as const, status: 200, contentType: 'json', body: { key: 'B' } },
    ],
  };

  it('unwraps a single request to its body and leaves an envelope alone', () => {
    expect(unwrapRaw({ requests: [raw.requests[1]!] })).toEqual({ key: 'A' });
    expect(unwrapRaw(raw)).toBe(raw);
  });

  it('finds requests by endpoint name — whole trailing segments, case-insensitively, query aside', () => {
    expect(findRequest(raw, 'getdetails')?.body).toEqual({ key: 'A' });
    expect(findRequest(raw, 'test-results/GetDetails')?.body).toEqual({ key: 'A' });
    expect(findRequest(raw, '/api/test-results/GetDetails')?.body).toEqual({ key: 'A' });
    expect(findRequests(raw, 'GetDetails')).toHaveLength(2);
    expect(bodyOf(raw, 'nothing')).toBeUndefined();
    // Never a substring: Load is a prefix of LoadExternal, GetFlowsheets of GetFlowsheetReadings.
    const parallel = {
      requests: [
        { path: '/Clinical/CareTeam/LoadExternal', method: 'POST' as const, status: 200, contentType: 'json', body: 'ext' },
        { path: '/Clinical/CareTeam/Load', method: 'POST' as const, status: 200, contentType: 'json', body: 'int' },
        { path: '/Billing/Details/GetVisits?id=1&context=2', method: 'GET' as const, status: 200, contentType: 'json', body: 'visits' },
      ],
    };
    expect(findRequest(parallel, 'CareTeam/Load')?.body).toBe('int');
    expect(findRequest(parallel, 'Load')?.body).toBe('int');
    expect(findRequest(parallel, 'GetVisits')?.body).toBe('visits');
    expect(findRequest(parallel, 'Details')).toBeUndefined();
  });

  it('strips only the noCache parameter', () => {
    expect(displayPath('/Visits/VisitsList?noCache=0.5')).toBe('/Visits/VisitsList');
    expect(displayPath('/Billing/Details/GetVisits?noCache=0.5&id=1&context=2')).toBe('/Billing/Details/GetVisits?id=1&context=2');
    expect(displayPath('/a?id=1&noCache=0.5')).toBe('/a?id=1');
  });
});

describe('renderOutput', () => {
  const processor: Processor<{ name: string; extra: string }> = {
    standard: (raw) => ({ name: text(rec(unwrapRaw(raw)).name), extra: 'kept' }),
    concise: (s) => ({ name: s.name }),
  };
  const raw = {
    requests: [{ path: '/x', method: 'GET' as const, status: 200, contentType: 'json', body: { name: 'A', junk: true } }],
  };

  it('returns the untouched body in raw mode', () => {
    expect(renderOutput(processor, raw, 'raw')).toEqual({ name: 'A', junk: true });
  });

  it('returns the standard object in json mode', () => {
    expect(renderOutput(processor, raw, 'json')).toEqual({ name: 'A', extra: 'kept' });
  });

  it('renders the standard object as markdown in standard mode', () => {
    expect(renderOutput(processor, raw, 'standard')).toBe('- **name**: A\n- **extra**: kept\n');
  });

  it('renders the concise projection as markdown in concise mode', () => {
    expect(renderOutput(processor, raw, 'concise')).toBe('- **name**: A\n');
  });

  it('passes a null standard object through concise without projecting', () => {
    const nullProcessor: Processor<null> = { standard: () => null, concise: () => ({ never: 1 }) };
    expect(renderOutput(nullProcessor, raw, 'concise')).toBe('(none)\n');
    expect(renderOutput(nullProcessor, raw, 'json')).toBeNull();
  });

  it('passthroughProcessor uses the same object for both', () => {
    const p = passthroughProcessor((r) => rec(unwrapRaw(r)));
    expect(p.concise(p.standard(raw))).toEqual({ name: 'A', junk: true });
  });

  it('knows its modes', () => {
    expect(OUTPUT_MODES).toEqual(['raw', 'standard', 'concise', 'json']);
    expect(isOutputMode('json')).toBe(true);
    expect(isOutputMode('xml')).toBe(false);
    expect(isOutputMode(1)).toBe(false);
  });
});

describe('readers', () => {
  it('never throw on the wrong type', () => {
    expect(rec(null)).toEqual({});
    expect(rec([1])).toEqual({});
    expect(rec({ a: 1 })).toEqual({ a: 1 });
    expect(list('x')).toEqual([]);
    expect(list([1])).toEqual([1]);
    expect(text(5)).toBe('');
    expect(text('s')).toBe('s');
    expect(textOrNull(undefined)).toBeNull();
    expect(textOrNull('')).toBe('');
    expect(bool('true')).toBe(false);
    expect(bool(true)).toBe(true);
    expect(num('1')).toBeNull();
    expect(num(NaN)).toBeNull();
    expect(num(2)).toBe(2);
    expect(strings([1, 'a', null])).toEqual(['a']);
  });

  it('parses Epic instants', () => {
    expect(epicInstantMs('/Date(1761851400000)/')).toBe(1761851400000);
    expect(epicInstantMs('nope')).toBeNull();
    expect(isoFromMs(0)).toBe('1970-01-01T00:00:00.000Z');
    expect(isoFromMs(null)).toBeNull();
  });
});

describe('unwrapRaw and token pages', () => {
  it('looks past the token-page fetch when unwrapping', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t">', contentType: 'text/html' },
      { body: JSON.stringify({ dataList: [] }) },
    ]);
    const collector = new RawCollector(req);
    const token = await collector.pageToken('/Clinical/Allergies');
    expect(token).toBe('t');
    await collector.postJson('/api/allergies/LoadAllergies', token, {});
    const raw = collector.toRaw();
    expect(raw.requests[0]!.purpose).toBe('token');
    expect(raw.requests[1]!.purpose).toBeUndefined();
    expect(unwrapRaw(raw)).toEqual({ dataList: [] });
  });

  it('throws MissingVerificationTokenError from pageToken when the page has none', async () => {
    const req = mockRequest([{ body: '<html></html>', contentType: 'text/html' }]);
    await expect(new RawCollector(req).pageToken('/x')).rejects.toThrow(/No request verification token on \/x/);
  });
});
