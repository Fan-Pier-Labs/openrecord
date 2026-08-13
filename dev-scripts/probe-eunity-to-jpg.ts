/**
 * Diagnostic: download one instance from each real series of a study and
 * decode to JPEG, proving the full pipeline (login → eUnity → CLO → JPG).
 *
 * Usage:
 *   MYCHART_PASSKEY_DIR=... bun dev-scripts/probe-eunity-to-jpg.ts <hostname> <image_id> <outDir>
 */
import * as fs from 'fs';
import * as path from 'path';
import { myChartPasskeyLogin } from '../scrapers/myChart/login';
import { passkeyLoginWithCounterRetry } from '../scrapers/myChart/passkeyLoginRetry';
import { serializeCredential, deserializeCredential } from '../scrapers/myChart/softwareAuthenticator';
import { initEunitySession, downloadSingleImage } from '../scrapers/myChart/eunity/imagingDirectDownload';
import { decodeImageId } from '../shared/capabilities';
import { convertCloToBitmap } from '../scrapers/myChart/clo-image-parser/clo_to_bitmap';
import { convertBitmapToJpg } from '../scrapers/myChart/clo-image-parser/exporters/to_jpg';

async function main() {
  const [hostname, imageId, outDir] = process.argv.slice(2);
  if (!hostname || !imageId || !outDir) {
    console.error('usage: probe-eunity-to-jpg.ts <hostname> <image_id> <outDir>');
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });

  const passkeyDir = process.env.MYCHART_PASSKEY_DIR;
  if (!passkeyDir) throw new Error('Set MYCHART_PASSKEY_DIR');
  const credPath = path.join(passkeyDir, `${hostname}.json`);
  const credential = deserializeCredential(fs.readFileSync(credPath, 'utf-8').trim());

  const loginResult = await passkeyLoginWithCounterRetry(
    (cred) => myChartPasskeyLogin({ hostname, credential: cred }),
    credential,
  );
  fs.writeFileSync(credPath, serializeCredential(credential), 'utf-8');
  if (loginResult.state !== 'logged_in') throw new Error(`Login failed: ${loginResult.state}`);
  const request = loginResult.mychartRequest;
  request.disableAutoKeepalive = true;

  const session = await initEunitySession(request, decodeImageId(imageId));
  if (!session) throw new Error('initEunitySession returned null');

  // Middle instance of each distinct series (middle slices show anatomy)
  const bySeries = new Map<string, Array<{ seriesUID: string; instanceUID: string; seriesDescription: string }>>();
  for (const s of session.series) {
    const arr = bySeries.get(s.seriesUID) ?? [];
    arr.push(s);
    bySeries.set(s.seriesUID, arr);
  }

  for (const [, instances] of bySeries) {
    const mid = instances[Math.floor(instances.length / 2)]!; // bySeries values are non-empty by construction
    const label = mid.seriesDescription.replace(/[^a-zA-Z0-9_-]/g, '_');
    try {
      const img = await downloadSingleImage(session, mid.seriesUID, mid.instanceUID);
      if (!img) {
        console.log(`${mid.seriesDescription}: no image (CLOERROR or too small)`);
        continue;
      }
      const pixelPath = path.join(outDir, `${label}_pixel.clo`);
      fs.writeFileSync(pixelPath, img.pixelData);
      let wrapperPath: string | undefined;
      if (img.wrapperData) {
        wrapperPath = path.join(outDir, `${label}_wrapper.clo`);
        fs.writeFileSync(wrapperPath, img.wrapperData);
      }
      const jpgPath = path.join(outDir, `${label}.jpg`);
      const bitmap = convertCloToBitmap(pixelPath, wrapperPath);
      await convertBitmapToJpg(bitmap, jpgPath);
      const stat = fs.statSync(jpgPath);
      console.log(`${mid.seriesDescription}: OK ${bitmap.width}x${bitmap.height} -> ${jpgPath} (${(stat.size / 1024).toFixed(0)} KB)`);
    } catch (err) {
      console.log(`${mid.seriesDescription}: FAILED ${(err as Error).message}`);
    }
  }
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
