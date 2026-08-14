import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { jsonSafeReplacer, runCapabilityAction } from '../capabilityActions';
import { MyChartRequest } from '../../../scrapers/myChart/core/myChartRequest';
import type { RequestConfig } from '../../../scrapers/myChart/core/types';
import { CAPABILITIES } from '../../../shared/capabilities';
import { resetLogSink, silenceLogger } from '../../../shared/logger';

/**
 * `--action <id>` used to call `capability.run` directly, skipping the
 * active-patient assertion in `executeCapability`; `cli.ts` compensated with a
 * guard of its own, which is not what the other clients run. These drive the
 * dispatch function with no `cli.ts` in front of it.
 */

const SELF_ID = 'WP-4KQZ8XVC5MJH4RTLN9PWY7BDF3SGA6EU1KXNQZ2RVJM8HTCBW5YLDP4FGS7AKEN3QRXZ6UVJ9MT';
const CHILD_ID = 'WP-7NQK4XZC2VJH8RTLM3PWY6BDF9SGA5EU1KXNQZ7RVJM2HTCBW4YLDP8FGS3AKEN6QRXZ9UVJ5MT';

const FAMILY = [
  { id: SELF_ID, displayName: 'Homer Jay Simpson', isSelf: true },
  { id: CHILD_ID, displayName: 'Bart Simpson', isSelf: false },
];

/** A portal whose server-side active patient is `activeId`. */
function familyRequest(activeId: string): MyChartRequest {
  const req = new MyChartRequest('mychart.example.org');
  req.setFirstPathPart('MyChart');
  req.makeRequest = mock(async (config: RequestConfig) => {
    if (config.path?.startsWith('/ProxySwitch')) {
      return new Response(
        JSON.stringify({
          ProxySubjectList: FAMILY.map((t) => ({
            Id: t.id,
            DisplayName: t.displayName,
            LinkUrl: t.isSelf
              ? 'inside.asp'
              : `inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=${t.id}`,
            IsSelected: t.id === activeId,
            IsSelf: t.isSelf,
          })),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (config.path === '/Home') {
      const name = FAMILY.find((t) => t.id === activeId)!.displayName;
      return new Response(
        `<html><body><div class="printheader">Name: ${name} | DOB: 1/1/2010 | MRN: 1 | PCP: X</div></body></html>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }
    throw new Error(`Unexpected request ${JSON.stringify(config)}`);
  });
  return req;
}

const session = (request: MyChartRequest) => ({ hostname: 'mychart.example.org', request });

/** Anything chart-touching will do; medications takes no required arguments. */
const MEDICATIONS = CAPABILITIES.find((c) => c.id === 'get_medications')!;
const IMAGING = CAPABILITIES.find((c) => c.rendersMedia)!;

let logged: string[] = [];
const realLog = console.log;

beforeAll(() => {
  silenceLogger();
  console.log = (...args: unknown[]) => { logged.push(args.join(' ')); };
});

afterAll(() => {
  console.log = realLog;
  resetLogSink();
});

describe('runCapabilityAction', () => {
  it('refuses a read while MyChart is on another patient', async () => {
    logged = [];
    const ok = await runCapabilityAction(MEDICATIONS, session(familyRequest(CHILD_ID)), undefined, {});

    expect(ok).toBe(false);
    expect(logged.join('\n')).toContain("MyChart is currently on 'Bart Simpson'");
  });

  it('refuses the media capability too — the one that used to skip the guard', async () => {
    logged = [];
    const ok = await runCapabilityAction(IMAGING, session(familyRequest(CHILD_ID)), undefined, {});

    expect(ok).toBe(false);
    expect(logged.join('\n')).toContain("MyChart is currently on 'Bart Simpson'");
  });

  it('passes --patient through so a deliberate proxy read is allowed', async () => {
    logged = [];
    const ok = await runCapabilityAction(
      MEDICATIONS,
      session(familyRequest(CHILD_ID)),
      undefined,
      {},
      undefined, // outputDir
      'Bart',
    );

    // The guard passed; the failure now comes from the scraper's own request,
    // which this fake portal does not serve. That is the proof it got past.
    expect(logged.join('\n')).not.toContain('Refusing to read');
    expect(ok).toBe(false);
  });

  it('refuses when --patient names someone the portal is not on', async () => {
    logged = [];
    const ok = await runCapabilityAction(
      MEDICATIONS,
      session(familyRequest(SELF_ID)),
      undefined,
      {},
      undefined, // outputDir
      'Bart',
    );

    expect(ok).toBe(false);
    expect(logged.join('\n')).toContain("MyChart is currently on 'Homer Jay Simpson'");
  });

  it('does not treat --patient as an unknown --arg', async () => {
    // `patient` is declared by the registry, not per capability, so folding it
    // into the coerced args before validation would trip the typo check.
    logged = [];
    await runCapabilityAction(MEDICATIONS, session(familyRequest(CHILD_ID)), undefined, {}, undefined, 'Bart');

    expect(logged.join('\n')).not.toContain('has no argument "patient"');
  });
});

describe('jsonSafeReplacer', () => {
  it('summarizes Uint8Arrays', () => {
    expect(jsonSafeReplacer('k', new Uint8Array(5))).toBe('<5 bytes>');
  });

  it('summarizes Buffers through JSON.stringify', () => {
    // JSON.stringify calls Buffer.toJSON() before the replacer runs, so the
    // replacer sees { type: 'Buffer', data: [...] } — it must catch that shape
    // or download_imaging_study floods the terminal with raw byte arrays.
    const out = JSON.parse(JSON.stringify({ pixelData: Buffer.alloc(3) }, jsonSafeReplacer)) as { pixelData: string };
    expect(out.pixelData).toBe('<3 bytes>');
  });

  it('leaves ordinary values and lookalike objects alone', () => {
    expect(jsonSafeReplacer('k', 'text')).toBe('text');
    expect(jsonSafeReplacer('k', 42)).toBe(42);
    expect(jsonSafeReplacer('k', null)).toBeNull();
    const notABuffer = { type: 'Buffer', data: 'not-an-array' };
    expect(jsonSafeReplacer('k', notABuffer)).toBe(notABuffer);
  });
});
