/**
 * @legacy - Playwright-based downloader. Prefer imagingDirectDownload.ts for direct HTTP downloads.
 *
 * Imaging JPEG downloader using Playwright.
 *
 * Downloads JPEG images from the eUnity DICOM viewer by:
 * 1. Navigating to the SAML URL (chains through STS → eUnity)
 * 2. Waiting for the WASM-based VIEWER API to initialize
 * 3. For each series: switching via DOUBLE-CLICK on the tray label
 *    (eUnity's Dart/WASM UI requires dblclick, not single click),
 *    then capturing each slice via canvas.toDataURL('image/jpeg', 1.0)
 * 4. Advancing slices via mouse wheel scroll, detecting end-of-series
 *    when the imageCursor stops advancing
 */
import { chromium, Browser, BrowserContext, Page } from 'playwright';

// The eUnity DICOM viewer exposes a global VIEWER object on the window
interface EUnityViewerState {
  seriesData?: { seriesDescription?: string }[];
  studies?: { accessionNumber?: string }[];
  screenLayout?: { layoutName?: string };
  selectedImage?: { seriesDescription?: string; imageCursor?: number };
}

interface EUnityViewer {
  getViewerState: () => EUnityViewerState;
}

interface EUnityWindow extends Window {
  VIEWER: EUnityViewer;
}
import * as fs from 'fs';
import * as path from 'path';

export interface DownloadedImage {
  filePath: string;
  sizeBytes: number;
  seriesDescription: string;
  sliceIndex: number;
  accessionNumber: string;
}

export interface ImageDownloadResult {
  studyName: string;
  images: DownloadedImage[];
  errors: string[];
}

interface TrayEntry {
  label: string;
  seriesNum: number;
  description: string;
  sliceCount: number;
}

/**
 * Download all JPEG images from an eUnity viewer session.
 */
export async function downloadImagingJpegs(
  samlUrl: string,
  studyName: string,
  outputDir: string,
  options?: {
    maxSlicesPerSeries?: number;
    browser?: Browser;
    timeout?: number;
  }
): Promise<ImageDownloadResult> {
  const maxSlices = options?.maxSlicesPerSeries ?? 500;
  const timeout = options?.timeout ?? 60000;
  const result: ImageDownloadResult = { studyName, images: [], errors: [] };

  const ownBrowser = !options?.browser;
  const browser = options?.browser ?? await chromium.launch({ headless: true });
  let context: BrowserContext | null = null;

  try {
    await fs.promises.mkdir(outputDir, { recursive: true });
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
    });
    const page = await context.newPage();

    // Navigate to SAML URL
    console.log(`      Navigating to SAML URL...`);
    await page.goto(samlUrl, { waitUntil: 'networkidle', timeout });

    if (!page.url().includes('/e/viewer') && !page.url().includes('/eUnity/viewer')) {
      result.errors.push(`Did not reach eUnity viewer. Landed on: ${page.url()}`);
      return result;
    }

    // Wait for VIEWER API
    console.log(`      Waiting for VIEWER API...`);
    try {
      await page.waitForFunction(
        () => typeof (window as unknown as EUnityWindow).VIEWER !== 'undefined' &&
              typeof (window as unknown as EUnityWindow).VIEWER.getViewerState === 'function',
        { timeout }
      );
    } catch {
      result.errors.push('VIEWER API did not initialize within timeout');
      return result;
    }

    // Wait for series data to populate
    await page.waitForFunction(
      () => {
        const s = (window as unknown as EUnityWindow).VIEWER.getViewerState();
        return s.seriesData && s.seriesData.length > 0;
      },
      { timeout: 30000 }
    );
    await page.waitForTimeout(4000);

    // Get accession and series count
    const { accession, seriesCount, layoutName } = await page.evaluate(() => {
      const state = (window as unknown as EUnityWindow).VIEWER.getViewerState();
      return {
        accession: state.studies?.[0]?.accessionNumber ?? 'unknown',
        seriesCount: state.seriesData?.length ?? 0,
        layoutName: state.screenLayout?.layoutName ?? 'unknown',
      };
    });
    console.log(`    eUnity loaded: ${seriesCount} series, accession ${accession}, layout ${layoutName}`);

    // ====== Open tray and process series ======
    if (seriesCount > 1) {
      await switchTo1x1Layout(page);
    }

    await openSeriesTray(page, seriesCount);
    const trayEntries = await readTrayLabels(page);

    console.log(`      Tray entries found: ${trayEntries.length}`);
    for (const t of trayEntries) {
      console.log(`        "${t.label}" → ${t.description} (${t.sliceCount} slices)`);
    }

    const seriesToProcess = trayEntries.length > 0 ? trayEntries : Array.from(
      { length: seriesCount },
      (_, i) => ({ label: '', seriesNum: i + 1, description: `Series_${i + 1}`, sliceCount: 1 })
    );

    for (let si = 0; si < seriesToProcess.length; si++) {
      const entry = seriesToProcess[si];

      if (si > 0 && entry.label) {
        console.log(`      Selecting series: "${entry.label}"...`);
        // Scroll into view + click via locator
        await page.evaluate((labelText: string) => {
          const allEls = Array.from(document.querySelectorAll('*'));
          for (let i = 0; i < allEls.length; i++) {
            const el = allEls[i] as HTMLElement;
            if (el.children.length > 0) continue;
            if (el.textContent?.trim() === labelText) {
              el.scrollIntoView({ block: 'center' });
              break;
            }
          }
        }, entry.label);
        await page.waitForTimeout(300);

        try {
          // eUnity's Dart/WASM UI requires double-click to switch series
          await page.locator(`text="${entry.label}"`).first().dblclick({ force: true, timeout: 5000 });
          await page.waitForTimeout(2000);
        } catch (e) {
          result.errors.push(`Failed to select "${entry.label}": ${(e as Error).message}`);
          continue;
        }
      }

      const currentDesc = await page.evaluate(() =>
        (window as unknown as EUnityWindow).VIEWER.getViewerState().selectedImage?.seriesDescription ?? 'unknown'
      );
      const seriesDesc = currentDesc !== 'unknown' ? currentDesc : entry.description;
      const safeName = makeSafeName(`${studyName}_${seriesDesc}`);
      const sliceTarget = Math.min(entry.sliceCount, maxSlices);

      console.log(`      Capturing ${seriesDesc} (expect ~${sliceTarget} slices)...`);

      await resetToFirstSlice(page);
      const center = await getCanvasCenter(page);

      let sliceIdx = 0;
      while (sliceIdx < sliceTarget) {
        const jpegBase64 = await page.evaluate(() => {
          const canvas = document.getElementById('mdiStage') as HTMLCanvasElement;
          if (!canvas) return null;
          return canvas.toDataURL('image/jpeg', 1.0).split(',')[1];
        });

        if (jpegBase64) {
          const fileName = sliceTarget === 1 && seriesToProcess.length === 1
            ? `${safeName}.jpg`
            : `${safeName}_slice${String(sliceIdx).padStart(4, '0')}.jpg`;
          const filePath = path.join(outputDir, fileName);
          const buffer = Buffer.from(jpegBase64, 'base64');
          await fs.promises.writeFile(filePath, buffer);
          result.images.push({
            filePath, sizeBytes: buffer.length, seriesDescription: seriesDesc,
            sliceIndex: sliceIdx, accessionNumber: accession,
          });
        } else {
          result.errors.push(`Canvas capture failed for ${seriesDesc} slice ${sliceIdx}`);
        }

        sliceIdx++;
        if (sliceIdx >= sliceTarget) break;

        const beforeCursor = await page.evaluate(() =>
          (window as unknown as EUnityWindow).VIEWER.getViewerState().selectedImage?.imageCursor ?? 0
        );
        if (center) {
          await page.mouse.move(center.x, center.y);
          await page.mouse.wheel(0, 120);
          await page.waitForTimeout(250);
        }
        const afterCursor = await page.evaluate(() =>
          (window as unknown as EUnityWindow).VIEWER.getViewerState().selectedImage?.imageCursor ?? 0
        );
        if (afterCursor === beforeCursor) break;
      }

      console.log(`      ${seriesDesc}: ${sliceIdx} image(s)`);
    }
  } catch (err) {
    result.errors.push(`Fatal error: ${(err as Error).message}`);
    console.log(`      Fatal error: ${(err as Error).message}`);
  } finally {
    if (context) await context.close();
    if (ownBrowser) await browser.close();
  }

  return result;
}

async function switchTo1x1Layout(page: Page): Promise<void> {
  const currentLayout = await page.evaluate(() =>
    (window as unknown as EUnityWindow).VIEWER.getViewerState().screenLayout?.layoutName
  );
  if (currentLayout === '1upStudyBox') {
    console.log(`      Already in 1x1 layout`);
    return;
  }
  console.log(`      Current layout: ${currentLayout}, switching...`);
  try {
    const layoutText = page.locator('text=/\\dx\\d\\s+Series/').first();
    if (await layoutText.isVisible({ timeout: 2000 }).catch(() => false)) {
      await layoutText.click();
      await page.waitForTimeout(500);
    } else {
      const altText = page.locator('text=/\\d+\\s+Series/').first();
      if (await altText.isVisible({ timeout: 1000 }).catch(() => false)) {
        await altText.click();
        await page.waitForTimeout(500);
      }
    }
  } catch { /* continue */ }
  try {
    const opt = page.locator('[title="1 Series"]').first();
    if (await opt.isVisible({ timeout: 2000 }).catch(() => false)) {
      await opt.click();
      await page.waitForTimeout(1500);
    }
  } catch { /* continue */ }
  const newLayout = await page.evaluate(() =>
    (window as unknown as EUnityWindow).VIEWER.getViewerState().screenLayout?.layoutName
  );
  console.log(`      Layout after switch: ${newLayout}`);
}

async function openSeriesTray(page: Page, expectedCount: number): Promise<void> {
  const isOpen = await page.evaluate(() => {
    const allEls = Array.from(document.querySelectorAll('*'));
    for (let i = 0; i < allEls.length; i++) {
      const el = allEls[i] as HTMLElement;
      if (el.children.length > 0) continue;
      const text = el.textContent?.trim();
      if (!text) continue;
      if (/(?:\d+-)?1:\s+/.test(text)) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) return true;
      }
    }
    return false;
  });
  if (isOpen) {
    console.log(`      Series tray already open`);
    return;
  }
  try {
    const countLocator = page.locator(`text="(${expectedCount})"`).first();
    if (await countLocator.isVisible({ timeout: 2000 }).catch(() => false)) {
      await countLocator.click();
      await page.waitForTimeout(800);
      console.log(`      Opened series tray`);
      return;
    }
  } catch { /* continue */ }
  try {
    const anyCount = page.locator('text=/^\\(\\d+\\)$/').first();
    if (await anyCount.isVisible({ timeout: 2000 }).catch(() => false)) {
      await anyCount.click();
      await page.waitForTimeout(800);
    }
  } catch { /* continue */ }
}

async function readTrayLabels(page: Page): Promise<TrayEntry[]> {
  return page.evaluate(() => {
    const results: Array<{ label: string; seriesNum: number; description: string; sliceCount: number }> = [];
    const allEls = Array.from(document.querySelectorAll('*'));
    const seen = new Set<string>();
    for (let i = 0; i < allEls.length; i++) {
      const el = allEls[i] as HTMLElement;
      if (el.children.length > 0) continue;
      const text = el.textContent?.trim();
      if (!text) continue;
      const match = text.match(/(?:\d+-)?(\d+):\s+(.+)$/);
      if (!match) continue;
      if (seen.has(text)) continue;
      seen.add(text);
      const seriesNum = parseInt(match[1], 10);
      const description = match[2];
      let sliceCount = 1;
      const parent = el.parentElement?.parentElement;
      if (parent) {
        const children = Array.from(parent.querySelectorAll('*'));
        for (let j = 0; j < children.length; j++) {
          const s = children[j] as HTMLElement;
          if (s === el || s.children.length > 0) continue;
          const num = parseInt(s.textContent?.trim() || '', 10);
          if (num > 0 && num < 10000) { sliceCount = num; break; }
        }
      }
      results.push({ label: text, seriesNum, description, sliceCount });
    }
    return results.sort((a, b) => a.seriesNum - b.seriesNum);
  });
}

async function resetToFirstSlice(page: Page): Promise<void> {
  const cursor = await page.evaluate(() =>
    (window as unknown as EUnityWindow).VIEWER.getViewerState().selectedImage?.imageCursor ?? 0
  );
  if (cursor === 0) return;
  const center = await getCanvasCenter(page);
  if (!center) return;
  for (let i = 0; i < cursor + 5; i++) {
    await page.mouse.move(center.x, center.y);
    await page.mouse.wheel(0, -120);
  }
  await page.waitForTimeout(500);
}

async function getCanvasCenter(page: Page): Promise<{ x: number; y: number } | null> {
  return page.evaluate(() => {
    const canvas = document.getElementById('mdiStage');
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
}

function makeSafeName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/__+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 100);
}
