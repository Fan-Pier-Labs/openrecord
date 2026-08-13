/**
 * Diagnostic: probe eUnity CustomImageServlet responses per series to see why
 * download_imaging_study returns 0 images. Logs response sizes and magic bytes
 * for one instance of every distinct series, plus the first 3 entries the
 * capability would pick with max_images=3.
 *
 * Usage:
 *   MYCHART_PASSKEY_DIR=/path/to/.passkey-credentials bun dev-scripts/probe-eunity-download.ts <hostname> <image_id>
 */
import * as fs from 'fs';
import * as path from 'path';
import { myChartPasskeyLogin } from '../scrapers/myChart/login';
import { passkeyLoginWithCounterRetry } from '../scrapers/myChart/passkeyLoginRetry';
import { serializeCredential, deserializeCredential } from '../scrapers/myChart/softwareAuthenticator';
import { initEunitySession } from '../scrapers/myChart/eunity/imagingDirectDownload';
import { decodeImageId } from '../shared/capabilities';
import { scraperFetch } from '../scrapers/http';

async function main() {
  const [hostname, imageId] = process.argv.slice(2);
  if (!hostname || !imageId) {
    console.error('usage: probe-eunity-download.ts <hostname> <image_id>');
    process.exit(1);
  }

  const passkeyDir = process.env.MYCHART_PASSKEY_DIR;
  if (!passkeyDir) throw new Error('Set MYCHART_PASSKEY_DIR');
  const credPath = path.join(passkeyDir, `${hostname}.json`);
  const credential = deserializeCredential(fs.readFileSync(credPath, 'utf-8').trim());

  console.log(`Logging in to ${hostname} with saved passkey (signCount=${credential.signCount})...`);
  const loginResult = await passkeyLoginWithCounterRetry(
    (cred) => myChartPasskeyLogin({ hostname, credential: cred }),
    credential,
  );
  // Persist the advanced sign count no matter what — the server has seen it.
  fs.writeFileSync(credPath, serializeCredential(credential), 'utf-8');
  if (loginResult.state !== 'logged_in') {
    throw new Error(`Login failed: ${loginResult.state} ${loginResult.error ?? ''}`);
  }
  console.log('Logged in.');
  const request = loginResult.mychartRequest;
  request.disableAutoKeepalive = true;

  const fdiContext = decodeImageId(imageId);
  const session = await initEunitySession(request, fdiContext);
  if (!session) throw new Error('initEunitySession returned null');

  console.log(`\nstudyUID: ${session.studyUID}`);
  console.log(`serviceInstance: ${session.serviceInstance}`);
  console.log(`series entries: ${session.series.length}`);

  // Distinct series with a sample instance
  const distinct = new Map<string, { desc: string; count: number; sample: { seriesUID: string; instanceUID: string } }>();
  for (const s of session.series) {
    const d = distinct.get(s.seriesUID);
    if (d) d.count++;
    else distinct.set(s.seriesUID, { desc: s.seriesDescription, count: 1, sample: { seriesUID: s.seriesUID, instanceUID: s.instanceUID } });
  }

  async function probe(label: string, seriesUID: string, objectUID: string, format: 'CLOWRAPPER' | 'CLOPIXEL') {
    const isPixel = format === 'CLOPIXEL';
    const body = new URLSearchParams({
      requestType: format,
      contentType: isPixel ? 'image/CLHAAR' : 'image/CLWAVE;image/CLHAAR;image/CLJPEG',
      studyUID: session!.studyUID,
      seriesUID,
      objectUID,
      frameNumber: '1',
      locale: 'en_US',
      haveImageData: isPixel ? 'partialps' : 'partialnops',
      serializeType: 'zlib',
      compressionVersion: '3',
      serviceInstance: session!.serviceInstance,
      level: '0',
    }).toString();

    try {
      const res = await scraperFetch(`${session!.baseUrl}/e/CustomImageServlet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body,
      }, { cookieJar: session!.cookieJar });
      const data = Buffer.from(await res.arrayBuffer());
      const head = data.subarray(0, 32);
      const ascii = head.toString('ascii').replace(/[^\x20-\x7e]/g, '.');
      console.log(`  [${label}] ${format} -> HTTP ${res.status} ${res.headers.get('content-type') ?? '?'} | ${data.length} bytes | head: "${ascii}"`);
      if (data.length < 2048 && data.length > 0) {
        const text = data.toString('utf-8').replace(/[^\x20-\x7e\n]/g, '.').slice(0, 400);
        console.log(`    body: ${text}`);
      }
    } catch (err) {
      console.log(`  [${label}] ${format} -> ERROR ${(err as Error).message}`);
    }
  }

  console.log('\n─── First 3 entries (what max_images=3 downloads) ───');
  for (const s of session.series.slice(0, 3)) {
    await probe(`entry ${s.seriesDescription}`, s.seriesUID, s.instanceUID, 'CLOWRAPPER');
  }

  console.log('\n─── One instance per distinct series ───');
  for (const [seriesUID, info] of distinct) {
    console.log(`series "${info.desc}" (${info.count} instances, UID ${seriesUID.slice(0, 40)}...)`);
    await probe(info.desc, seriesUID, info.sample.instanceUID, 'CLOWRAPPER');
    await probe(info.desc, seriesUID, info.sample.instanceUID, 'CLOPIXEL');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
