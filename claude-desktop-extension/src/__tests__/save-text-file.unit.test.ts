// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/** `save_file` writes the model's text under its chosen name — never outside the folder, never over an earlier file. */
import { describe, expect, test } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { saveTextFile } from '../save-file';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'save-text-'));

describe('saveTextFile', () => {
  test('writes the content under the given name', () => {
    const dir = tmp();
    const saved = saveTextFile('lab-history.csv', 'date,value\n2026-01-01,5.4\n', dir);
    expect(saved).toBe(path.join(dir, 'lab-history.csv'));
    expect(fs.readFileSync(saved, 'utf8')).toBe('date,value\n2026-01-01,5.4\n');
  });

  test('never overwrites an earlier file', () => {
    const dir = tmp();
    saveTextFile('summary.md', 'first', dir);
    const second = saveTextFile('summary.md', 'second', dir);
    expect(second).toBe(path.join(dir, 'summary-2.md'));
    expect(fs.readFileSync(path.join(dir, 'summary.md'), 'utf8')).toBe('first');
  });

  test('keeps a path-shaped name inside the folder', () => {
    const dir = tmp();
    expect(saveTextFile('../../etc/notes.txt', 'x', dir)).toBe(path.join(dir, 'notes.txt'));
    expect(saveTextFile('..\\..\\evil.txt', 'x', dir)).toBe(path.join(dir, 'evil.txt'));
    expect(saveTextFile('..', 'x', dir)).toBe(path.join(dir, 'openrecord-export.md'));
  });

  test('saves a name without an extension as Markdown', () => {
    expect(path.basename(saveTextFile('My summary', '# hi', tmp()))).toBe('My summary.md');
  });
});
