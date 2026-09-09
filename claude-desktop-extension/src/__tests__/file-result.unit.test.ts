/**
 * A `returnsFile` payload is delivered as a file on disk, plus an inline
 * picture when it is an image the host can show. Both halves are pinned here:
 * the result builder always writes the file (a PDF has nowhere else to go),
 * never overwrites an earlier download of the same name, and only inlines an
 * image that fits under the host's result cap.
 */
import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAllTools, fileResult } from '../tools';
import { saveFilePayload } from '../save-file';
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
    fileName: 'proof of coverage.pdf',
    fileExtension: 'PDF',
    mimeType: 'application/pdf',
    bytes: PDF,
    ...overrides,
  };
}

function summary(result: ReturnType<typeof fileResult>): Record<string, unknown> {
  const first = result.content[0]!;
  if (first.type !== 'text') throw new Error('first block is not the summary');
  return JSON.parse(first.text) as Record<string, unknown>;
}

let baseDir: string;

beforeEach(() => {
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openrecord-file-result-'));
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

  test('every returnsFile tool, and only those, offers return_content', () => {
    const withParam = [...captureTools().entries()]
      .filter(([, tool]) => 'return_content' in (tool.config.inputSchema ?? {}))
      .map(([name]) => name)
      .sort();
    expect(withParam).toEqual(['download_billing_statement', 'get_message_attachment']);
  });
});

describe('fileResult', () => {
  test('writes a PDF to disk and reports where, with no inline block', () => {
    const result = fileResult(file(), false, baseDir);
    const s = summary(result);
    expect(s.file_name).toBe('proof of coverage.pdf');
    expect(s.mime_type).toBe('application/pdf');
    expect(s.size_bytes).toBe(PDF.length);
    expect(s.saved_to).toBe(path.join(baseDir, 'proof of coverage.pdf'));
    expect(fs.readFileSync(s.saved_to as string)).toEqual(Buffer.from(PDF));
    expect(result.content).toHaveLength(1);
    expect(String(s.note)).toContain('Open the saved PDF');
    expect(String(s.note)).toContain('return_content: true');
    // What the capability knew about the file rides along; the bytes never do.
    expect(s.dcsId).toBe('WP-DCS-1');
    expect(s).not.toHaveProperty('bytes');
  });

  test('shows an image inline as well as saving it', () => {
    const result = fileResult(file({ fileName: 'card.jpg', fileExtension: 'JPG', mimeType: 'image/jpeg', bytes: JPEG }), false, baseDir);
    expect(result.content).toHaveLength(2);
    expect(result.content[1]).toEqual({ type: 'image', data: Buffer.from(JPEG).toString('base64'), mimeType: 'image/jpeg' });
    expect(fs.existsSync(path.join(baseDir, 'card.jpg'))).toBe(true);
    expect(summary(result)).not.toHaveProperty('note');
  });

  test('saves an image over the inline budget without inlining it, and says so', () => {
    const big = new Uint8Array(INLINE_BUDGET_BYTES);
    const result = fileResult(file({ fileName: 'scan.png', fileExtension: 'PNG', mimeType: 'image/png', bytes: big }), false, baseDir);
    expect(result.content).toHaveLength(1);
    expect(String(summary(result).note)).toContain('too large');
    expect(fs.statSync(path.join(baseDir, 'scan.png')).size).toBe(big.length);
  });
});

describe('fileResult with return_content', () => {
  test('embeds a PDF as a document beside the saved copy', () => {
    const result = fileResult(file(), true, baseDir);
    expect(result.content).toHaveLength(2);
    expect(result.content[1]).toEqual({
      type: 'resource',
      resource: { uri: pathToFileURL(path.join(baseDir, 'proof of coverage.pdf')).href, mimeType: 'application/pdf', blob: Buffer.from(PDF).toString('base64') },
    });
    expect(summary(result)).not.toHaveProperty('note');
    expect(fs.existsSync(path.join(baseDir, 'proof of coverage.pdf'))).toBe(true);
  });

  test('returns a text file as text', () => {
    const csv = new TextEncoder().encode('date,amount\n2026-01-15,350.00\n');
    const result = fileResult(file({ fileName: 'charges.csv', fileExtension: 'CSV', mimeType: 'text/csv', bytes: csv }), true, baseDir);
    expect(result.content[1]).toEqual({ type: 'text', text: 'date,amount\n2026-01-15,350.00\n' });
  });

  test('saves a PDF over the budget without embedding it, and says so', () => {
    const big = new Uint8Array(INLINE_BUDGET_BYTES);
    const result = fileResult(file({ bytes: big }), true, baseDir);
    expect(result.content).toHaveLength(1);
    expect(String(summary(result).note)).toContain('too large');
    expect(fs.statSync(path.join(baseDir, 'proof of coverage.pdf')).size).toBe(big.length);
  });

  test('says a type it cannot show was only saved', () => {
    const result = fileResult(file({ fileName: 'notes.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), true, baseDir);
    expect(result.content).toHaveLength(1);
    expect(String(summary(result).note)).toContain('cannot be shown');
  });
});

describe('saveFilePayload', () => {
  test('never overwrites an earlier download of the same name', () => {
    const first = saveFilePayload(file({ fileName: 'bill.pdf' }), baseDir);
    const second = saveFilePayload(file({ fileName: 'bill.pdf', bytes: JPEG }), baseDir);
    expect(first).toBe(path.join(baseDir, 'bill.pdf'));
    expect(second).toBe(path.join(baseDir, 'bill-2.pdf'));
    expect(fs.readFileSync(first)).toEqual(Buffer.from(PDF));
  });

  test('writes only a basename, whatever the payload says', () => {
    expect(saveFilePayload(file({ fileName: '/tmp/elsewhere/bill.pdf' }), baseDir)).toBe(path.join(baseDir, 'bill.pdf'));
  });
});
