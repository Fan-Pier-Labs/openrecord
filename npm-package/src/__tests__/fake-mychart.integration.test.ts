/**
 * End-to-end integration test for the published `mychart-cli` package.
 *
 * Imports from the BUILT artifact (`../../dist/index.js`) so the test
 * exercises the same code consumers will run after `npm install`.
 *
 * Targets `localhost:4000` — the compose service from `docker-compose.ci.yaml`
 * that every other `*.integration.test.ts` in the repo uses. Set
 * `FAKE_MYCHART_HOST` to point elsewhere (e.g. the hosted
 * `fake-mychart.fanpierlabs.com`). The client auto-detects http for hostnames
 * without a dot.
 *
 * The default used to be the hosted instance, which meant this file reached out
 * to the public internet whenever the env var was missing — and it failed that
 * way the first time it was run alongside the other integration suites instead
 * of from its own CI step. A test's default target should be the one every
 * other test in its suite uses.
 *
 * Credentials are the standard Homer Simpson test account from `fake-mychart`.
 */

import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { MyChartClient as MyChartClientT, ConnectResult } from '../../dist/index.js';

// Resolve at runtime so we read whatever is in dist/.
const {
  MyChartClient,
  MyChartRequest,
  getMedications,
  decodeImageId,
  convertCloToBitmap,
  convertBitmapToJpg,
} = await import('../../dist/index.js') as typeof import('../../dist/index.js');

const HOSTNAME = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000';
const USER = 'homer';
const PASS = 'donuts123';
const TWO_FA_CODE = '123456';

let client: MyChartClientT;

beforeAll(async () => {
  const result: ConnectResult = await MyChartClient.connect({
    hostname: HOSTNAME,
    user: USER,
    pass: PASS,
    keepalive: false, // disable in tests so timers don't keep the process alive
  });

  if (result.state === 'connected') {
    client = result.client;
    return;
  }
  if (result.state === 'need_2fa') {
    client = await result.complete(TWO_FA_CODE);
    return;
  }
  throw new Error(`login failed: state=${result.state} error=${'error' in result ? result.error : ''}`);
});

afterAll(() => {
  client?.close();
});

test('login establishes a session', async () => {
  expect(client).toBeDefined();
  expect(client.request).toBeInstanceOf(MyChartRequest);
  const cookies = client.request.getCookieInfo();
  expect(cookies.count).toBeGreaterThan(0);
});

test('getProfile returns Homer Simpson', async () => {
  const profile = await client.getProfile();
  expect(profile).toBeDefined();
  // Profile shape is implementation-defined; just verify a non-empty name.
  const name = JSON.stringify(profile).toLowerCase();
  expect(name).toContain('homer');
});

test('getMedications returns a list', async () => {
  const meds = await client.getMedications();
  expect(meds).toBeDefined();
  expect(Array.isArray(meds.prescriptions)).toBe(true);
});

test('raw scraper API also works (parity with class API)', async () => {
  const meds = await getMedications(client.request);
  expect(meds).toBeDefined();
  expect(Array.isArray(meds.prescriptions)).toBe(true);
});

test('serialize → fromSerialized round-trips without re-login', async () => {
  const json = await client.serialize();
  expect(json.length).toBeGreaterThan(0);

  const restored = await MyChartClient.fromSerialized(json, { keepalive: false });
  expect(restored).not.toBeNull();
  const profile = await restored!.getProfile();
  expect(JSON.stringify(profile).toLowerCase()).toContain('homer');
  restored!.close();
});

test('isSessionValid reports the active session as valid', async () => {
  const valid = await client.isSessionValid();
  expect(valid).toBe(true);
});

test('close() prevents further calls', async () => {
  const result = await MyChartClient.connect({
    hostname: HOSTNAME,
    user: USER,
    pass: PASS,
    keepalive: false,
  });
  let throwaway: MyChartClientT;
  if (result.state === 'connected') throwaway = result.client;
  else if (result.state === 'need_2fa') throwaway = await result.complete(TWO_FA_CODE);
  else throw new Error('unexpected login state');

  throwaway.close();
  expect(() => throwaway.getProfile()).toThrow('closed');
});

test('downloadImagingStudyDirect → decode → export produces a valid JPEG', async () => {
  const imagingResults = await client.getImagingResults();
  expect(Array.isArray(imagingResults.orders)).toBe(true);

  const xray = imagingResults.orders.find(
    (r) => r.image_id && (r.orderName ?? '').includes('XR'),
  );
  expect(xray).toBeDefined();

  const downloadResult = await client.downloadImagingStudy(
    decodeImageId(xray!.image_id!),
    'Homer Skull XRay',
    '/tmp/npm-package-xray-test',
    { skipFileWrite: true },
  );

  expect(downloadResult.errors).toHaveLength(0);
  expect(downloadResult.images.length).toBeGreaterThan(0);

  // Non-null: the length assertion above guarantees at least one image.
  const firstImage = downloadResult.images[0]!;
  expect(firstImage.format).toBe('CLHAAR');
  expect(firstImage.pixelData).toBeDefined();
  expect(firstImage.pixelData!.length).toBeGreaterThan(0);
  expect(firstImage.wrapperData).toBeDefined();

  // Two steps: decode the CLO, then encode the bitmap.
  const bitmap = convertCloToBitmap(firstImage.pixelData!, firstImage.wrapperData);
  const jpeg = await convertBitmapToJpg(bitmap);
  expect(Buffer.isBuffer(jpeg)).toBe(true);
  const buf = jpeg;
  expect(buf.byteLength).toBeGreaterThan(1000);
  // JPEG magic: starts with FF D8, ends with FF D9.
  expect(buf[0]).toBe(0xff);
  expect(buf[1]).toBe(0xd8);
  expect(buf[buf.byteLength - 2]).toBe(0xff);
  expect(buf[buf.byteLength - 1]).toBe(0xd9);
}, 120_000);
