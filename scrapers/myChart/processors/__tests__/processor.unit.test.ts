import { describe, it, expect, mock } from 'bun:test';
import { MyChartRequest } from '../../core/myChartRequest';
import { RawCollector, unwrapRaw, findRequest, findRequests, bodyOf, displayPath } from '../../core/rawResponse';
import { renderOutput, passthroughProcessor, isOutputMode, OUTPUT_MODES, type Processor } from '../processor';
import { rec, list, text, textOrNull, bool, num, strings, epicInstantMs, isoFromMs } from '../read';

function mockRequest(responses: Array<{ body: string; status?: number; contentType?: string }>) {
  const req = new MyChartRequest('mychart.example.com');
  req.firstPathPart = 'MyChart';
  let i = 0;
  req.transport = mock(async () => {
    const r = responses[i++]!;
    return new Response(r.body, {
      status: r.status ?? 200,
      headers: { 'content-type': r.contentType ?? 'application/json' },
    });
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
    const req = mockRequest([{ body: 'Request Rejected', contentType: 'text/html' }]);
    const collector = new RawCollector(req);
    await collector.send({
      path: '/x',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'a=1',
    });
    expect(collector.requests[0]!.body).toBe('Request Rejected');
    expect(collector.requests[0]!.requestBody).toBe('a=1');
  });

  it('records a JSON body that failed to parse as the string it was', async () => {
    const req = mockRequest([{ body: '{}' }]);
    const collector = new RawCollector(req);
    await collector.send({ path: '/x', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json' });
    expect(collector.requests[0]!.requestBody).toBe('{not json');
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
