/**
 * A message attachment is delivered as a file on disk, plus an inline picture
 * when it is an image the host can show. Both halves are pinned here: the
 * result builder always writes the file (a PDF has nowhere else to go), never
 * overwrites an earlier download of the same name, and only inlines an image
 * that fits under the host's result cap.
 */
import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAllTools, attachmentResult } from '../tools';
import { saveToDownloads } from '../save-file';
import { INLINE_BUDGET_BYTES } from '../imaging/inline-preview';
import type { MessageAttachmentFile } from '../../../shared/capabilities';

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

const PDF = new TextEncoder().encode('%PDF-1.4\n%fake\n');
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);

function file(overrides: Partial<MessageAttachmentFile> = {}): MessageAttachmentFile {
  return {
    conversationId: 'CONV-1',
    dcsId: 'WP-DCS-1',
    name: 'proof of coverage.pdf',
    fileExtension: 'PDF',
    mimeType: 'application/pdf',
    bytes: PDF,
    ...overrides,
  };
}

function summary(result: ReturnType<typeof attachmentResult>): Record<string, unknown> {
  const first = result.content[0]!;
  if (first.type !== 'text') throw new Error('first block is not the summary');
  return JSON.parse(first.text) as Record<string, unknown>;
}

let baseDir: string;

beforeEach(() => {
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openrecord-attachment-'));
});

afterEach(() => {
  fs.rmSync(baseDir, { recursive: true, force: true });
});

describe('get_message_attachment registration', () => {
  test('takes the conversation and attachment ids, and not the imaging save flag', () => {
    const schema = captureTools().get('get_message_attachment')?.config.inputSchema ?? {};
    expect(Object.keys(schema)).toContain('conversation_id');
    expect(Object.keys(schema)).toContain('attachment_id');
    // The file is always saved: there is no opt-in, so no parameter for one.
    expect(Object.keys(schema)).not.toContain('save_to_downloads');
    expect(Object.keys(schema)).not.toContain('mode');
  });
});

describe('attachmentResult', () => {
  test('writes a PDF to disk and reports where, with no inline block', () => {
    const result = attachmentResult(file(), baseDir);
    const s = summary(result);
    expect(s.name).toBe('proof of coverage.pdf');
    expect(s.mime_type).toBe('application/pdf');
    expect(s.size_bytes).toBe(PDF.length);
    expect(s.saved_to).toBe(path.join(baseDir, 'proof of coverage.pdf'));
    expect(fs.readFileSync(s.saved_to as string)).toEqual(Buffer.from(PDF));
    expect(result.content).toHaveLength(1);
    expect(String(s.note)).toContain('Open the saved PDF');
  });

  test('shows an image inline as well as saving it', () => {
    const result = attachmentResult(file({ name: 'card.jpg', fileExtension: 'JPG', mimeType: 'image/jpeg', bytes: JPEG }), baseDir);
    expect(result.content).toHaveLength(2);
    expect(result.content[1]).toEqual({ type: 'image', data: Buffer.from(JPEG).toString('base64'), mimeType: 'image/jpeg' });
    expect(fs.existsSync(path.join(baseDir, 'card.jpg'))).toBe(true);
    expect(summary(result)).not.toHaveProperty('note');
  });

  test('saves an image over the inline budget without inlining it, and says so', () => {
    const big = new Uint8Array(INLINE_BUDGET_BYTES);
    const result = attachmentResult(file({ name: 'scan.png', fileExtension: 'PNG', mimeType: 'image/png', bytes: big }), baseDir);
    expect(result.content).toHaveLength(1);
    expect(String(summary(result).note)).toContain('too large');
    expect(fs.statSync(path.join(baseDir, 'scan.png')).size).toBe(big.length);
  });
});

describe('saveToDownloads', () => {
  test('never overwrites an earlier download of the same name', () => {
    const first = saveToDownloads('bill.pdf', 'PDF', PDF, baseDir);
    const second = saveToDownloads('bill.pdf', 'PDF', JPEG, baseDir);
    expect(first).toBe(path.join(baseDir, 'bill.pdf'));
    expect(second).toBe(path.join(baseDir, 'bill-2.pdf'));
    expect(fs.readFileSync(first)).toEqual(Buffer.from(PDF));
  });

  test('strips path separators and falls back to the extension when the name is empty', () => {
    expect(path.basename(saveToDownloads('../../evil/../x:y.pdf', 'PDF', PDF, baseDir))).toBe('_.._evil_.._x_y.pdf');
    expect(path.basename(saveToDownloads('', 'PDF', PDF, baseDir))).toBe('attachment.pdf');
    expect(path.basename(saveToDownloads('   ', '', PDF, baseDir))).toBe('attachment');
    expect(fs.readdirSync(baseDir).sort()).toEqual(['_.._evil_.._x_y.pdf', 'attachment', 'attachment.pdf']);
  });
});
