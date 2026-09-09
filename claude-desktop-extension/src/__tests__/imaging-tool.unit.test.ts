/**
 * Saving an imaging study to disk is opt-in, and this is what holds it there.
 *
 * Showing a scan must stay read-only: a user who asks to see an X-ray has not
 * asked for files in their Downloads folder, and a regression that writes on
 * every view is invisible from inside the conversation. So both halves are
 * pinned — the parameter exists on the media tool and nowhere else, and the
 * result builder writes nothing unless it is told to.
 */
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAllTools, imagingResult } from '../tools';
import type { StudyImagePayload } from '../../../shared/capabilities';
import { encodePixelFile } from '../../../scrapers/myChart/clo-image-parser/generate_clo';

type RegisteredTool = { config: { inputSchema?: Record<string, unknown> } };

function captureTools(): Map<string, RegisteredTool> {
  const tools = new Map<string, RegisteredTool>();
  const server = {
    registerTool: (name: string, config: RegisteredTool['config']) => {
      tools.set(name, { config });
    },
  } as unknown as McpServer;
  registerAllTools(server);
  return tools;
}

const tools = captureTools();

const CLO_DIR = join(__dirname, '../../../fake-mychart/src/data/clo-images');

function xrayPayload(): StudyImagePayload {
  return {
    studyName: 'XR CHEST',
    totalImages: 1,
    images: [
      {
        index: 0,
        seriesUID: 'S1',
        seriesDescription: 'PA VIEW',
        pixelData: readFileSync(join(CLO_DIR, 'checkerboard_512x512_pixel.clo')),
        wrapperData: readFileSync(join(CLO_DIR, 'checkerboard_512x512_wrapper.clo')),
      },
    ],
    errors: [],
  };
}

describe('save_to_downloads registration', () => {
  test('the imaging tool offers it, and it is optional', () => {
    const schema = tools.get('download_imaging_study')?.config.inputSchema;
    expect(Object.keys(schema ?? {})).toContain('save_to_downloads');
  });

  test('no other tool offers it — it is gated on rendersMedia, not a tool name', () => {
    const withParam = [...tools.entries()]
      .filter(([, tool]) => 'save_to_downloads' in (tool.config.inputSchema ?? {}))
      .map(([name]) => name);
    expect(withParam).toEqual(['download_imaging_study']);
  });
});

describe('imagingResult', () => {
  test('renders the pictures without touching the disk when saving is not asked for', async () => {
    const result = await imagingResult(xrayPayload(), false);

    // The images still come back — this is the "show me my X-ray" path.
    expect(result.content.filter((c) => c.type === 'image')).toHaveLength(1);

    // Nothing failed trying to write: a failed save would have left an error.
    const summary = JSON.parse((result.content[0] as { text: string }).text);
    expect(summary.errors).toBeUndefined();
    expect(summary.returned).toBe(1);
    expect(summary.shown_inline).toBe(1);
  });

  test('a full-size study comes back under the 1MB tool-result cap', async () => {
    // Three ~2500px views, the shape of a real shoulder series: each is ~4MB
    // at full resolution, and the host rejects the whole result over 1MB.
    const width = 2500;
    const height = 2048;
    const pixels = new Uint16Array(width * height);
    let seed = 3;
    for (let i = 0; i < pixels.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      pixels[i] = Math.round(((i % width) / width) * 50000 + (seed % 10000));
    }
    const pixelData = encodePixelFile(pixels, width, height);
    const study: StudyImagePayload = {
      studyName: 'XR SHOULDER',
      totalImages: 3,
      images: [0, 1, 2].map((index) => ({ index, seriesUID: `S${index}`, seriesDescription: `VIEW ${index}`, pixelData })),
      errors: [],
    };

    const result = await imagingResult(study, false);

    expect(JSON.stringify(result).length).toBeLessThan(1024 * 1024);
    expect(result.content.filter((c) => c.type === 'image')).toHaveLength(3);
    const summary = JSON.parse((result.content[0] as { text: string }).text);
    expect(summary.returned).toBe(3);
    expect(summary.shown_inline).toBe(3);
    expect(summary.note).toContain('reduced-size previews');
    expect(summary.note).toContain('save_to_downloads');
  });
});

describe('imagingResult with save_to_downloads', () => {
  test('saves the images and answers with one confirmation, no pictures', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'openrecord-save-'));
    try {
      const result = await imagingResult(xrayPayload(), true, dir);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]!.type).toBe('text');
      expect((result.content[0] as { text: string }).text).toContain('Successfully saved 1 full-resolution image');
      const studyDir = readdirSync(dir).map((name) => join(dir, name)).find((p) => statSync(p).isDirectory());
      expect(studyDir).toBeDefined();
      expect(readdirSync(studyDir!).some((f) => f.endsWith('.jpg'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('falls through to the previews, with the error beside them, when the save fails', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'openrecord-save-'));
    try {
      // A file where the study folder's parent should be: mkdir fails with ENOTDIR.
      const notADir = join(dir, 'not-a-directory');
      writeFileSync(notADir, '');
      const result = await imagingResult(xrayPayload(), true, notADir);
      expect(result.content.filter((c) => c.type === 'image')).toHaveLength(1);
      const summary = JSON.parse((result.content[0] as { text: string }).text);
      expect(summary.errors).toHaveLength(1);
      expect(summary.errors[0]).toContain('could not save them to disk');
      // Telling the user to pass the flag they just passed would be noise.
      expect(summary.note ?? '').not.toContain('Pass save_to_downloads');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
