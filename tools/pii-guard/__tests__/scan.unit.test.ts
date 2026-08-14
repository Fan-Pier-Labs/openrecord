/**
 * The guard end to end: a diff in, findings out.
 *
 * These are the assertions that say what the tool actually promises. The ones
 * that matter most are the negatives — a guard that blocks a fictional
 * `555-0134` or an `example.com` address gets turned off within a week, and
 * then it protects nothing at all.
 *
 * Every value here is invented. The directory is on the guard's skip list so
 * that stays true without the guard blocking its own tests.
 */

import { describe, expect, it } from 'bun:test';

import { parseDenylist } from '../denylist';
import { parseUnifiedDiff } from '../diff';
import { scanDiff, scanText, globToRegExp, maskedWindows, numericCandidates, emailCandidates } from '../scan';
import { blocking, formatReport } from '../report';
import { luhnValid } from '../structural';
import type { ScanOptions } from '../types';

const DENYLIST = `
email: ryanexample@realdomain.com
phone: +1 617 555 7788
name: Marigold Featherstone
dob: 1980-01-02
mrn: 4471902
`;

function options(overrides: Partial<ScanOptions> = {}): ScanOptions {
  const { needles, problems } = parseDenylist(DENYLIST);
  expect(problems).toEqual([]);
  return { needles, allowlist: new Set<string>(), skipPaths: [], ...overrides };
}

/** Build a one-file, one-hunk diff whose added lines start at line 10. */
function diffOf(...lines: string[]): string {
  return [
    'diff --git a/src/app.ts b/src/app.ts',
    'index 1111111..2222222 100644',
    '--- a/src/app.ts',
    '+++ b/src/app.ts',
    `@@ -10,0 +10,${lines.length} @@`,
    ...lines.map((line) => `+${line}`),
  ].join('\n');
}

const rules = (findings: { rule: string }[]) => findings.map((finding) => finding.rule).sort();

describe('parseUnifiedDiff', () => {
  it('numbers added lines from the hunk header', () => {
    const { added } = parseUnifiedDiff(diffOf('one', 'two', 'three'));
    expect(added.map((line) => line.line)).toEqual([10, 11, 12]);
    expect(added[0]?.file).toBe('src/app.ts');
  });

  it('counts context lines but not removed ones', () => {
    const diff = [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -5,3 +5,3 @@',
      ' context',
      '-gone',
      '+added',
    ].join('\n');
    expect(parseUnifiedDiff(diff).added).toEqual([{ file: 'a.ts', line: 6, text: 'added' }]);
  });

  it('ignores a deleted file, which has nothing new in it', () => {
    const diff = [
      'diff --git a/gone.ts b/gone.ts',
      '--- a/gone.ts',
      '+++ /dev/null',
      '@@ -1,1 +0,0 @@',
      '-secret@realdomain.com',
    ].join('\n');
    expect(parseUnifiedDiff(diff).added).toEqual([]);
  });

  it('records binary files by path', () => {
    const diff = [
      'diff --git a/shot.png b/shot.png',
      'new file mode 100644',
      'Binary files /dev/null and b/shot.png differ',
    ].join('\n');
    expect(parseUnifiedDiff(diff).binaryFiles).toEqual(['shot.png']);
  });

  it('decodes the escapes inside a quoted path', () => {
    // git quotes any path with unusual bytes and escapes them octally; a path
    // we decode wrongly is a path whose findings point somewhere that does not
    // exist.
    const diff = [
      'diff --git "a/caf\\303\\251/x.ts" "b/caf\\303\\251/x.ts"',
      '--- "a/caf\\303\\251/x.ts"',
      '+++ "b/caf\\303\\251/x.ts"',
      '@@ -0,0 +1,1 @@',
      '+x',
    ].join('\n');
    expect(parseUnifiedDiff(diff).added[0]?.file).toBe('cafÃ©/x.ts');
  });

  it('unquotes paths git had to escape', () => {
    const diff = [
      'diff --git "a/dir/a b.ts" "b/dir/a b.ts"',
      '--- "a/dir/a b.ts"',
      '+++ "b/dir/a b.ts"',
      '@@ -0,0 +1,1 @@',
      '+x',
    ].join('\n');
    expect(parseUnifiedDiff(diff).added[0]?.file).toBe('dir/a b.ts');
  });
});

describe('structural rules', () => {
  it('blocks a real-looking email address', () => {
    const findings = scanDiff(diffOf('const to = "someone@realdomain.com";'), options());
    expect(rules(findings)).toContain('structural:email');
    expect(findings[0]?.severity).toBe('block');
  });

  it('leaves documentation addresses alone', () => {
    for (const address of ['user@example.com', 'x@thing.test', 'noreply@github.com']) {
      expect(scanDiff(diffOf(`const to = "${address}";`), options())).toEqual([]);
    }
  });

  it('blocks a formatted phone number but not the reserved fictional block', () => {
    expect(rules(scanDiff(diffOf('call 212-887-9013'), options()))).toContain('structural:phone-formatted');
    expect(scanDiff(diffOf('call 212-555-0134'), options())).toEqual([]);
  });

  it('does not mistake a timestamp or an id for a phone number', () => {
    // Ten and thirteen digit runs are epochs and identifiers far more often
    // than they are phone numbers; only punctuation or a label makes one.
    const structuralOnly: ScanOptions = { needles: [], allowlist: new Set(), skipPaths: [] };
    expect(scanDiff(diffOf('const at = 1755000000;'), structuralOnly)).toEqual([]);
    expect(scanDiff(diffOf('const id = 1755000000123;'), structuralOnly)).toEqual([]);
  });

  it('blocks a labelled phone number that has no punctuation', () => {
    expect(rules(scanDiff(diffOf('mobile: 2128879013'), options()))).toContain('structural:phone-labelled');
  });

  it('blocks a Social Security number and skips never-issued prefixes', () => {
    expect(rules(scanDiff(diffOf('ssn 123-45-6789'), options()))).toContain('structural:ssn');
    expect(scanDiff(diffOf('id 000-00-0000'), options())).toEqual([]);
  });

  it('blocks a card number only when the issuer prefix and Luhn agree', () => {
    expect(luhnValid('4111111111111111')).toBe(true);
    expect(rules(scanDiff(diffOf('card 4111 1111 1111 1111'), options()))).toContain('structural:card');
    // Luhn-valid, but no issuer owns a leading 9 — an internal identifier.
    expect(rules(scanDiff(diffOf('const ref = 9111111111111117;'), options()))).not.toContain('structural:card');
  });

  it('blocks a labelled record number but not a type annotation', () => {
    expect(rules(scanDiff(diffOf('MRN: 8813402'), options()))).toContain('structural:record-number');
    expect(scanDiff(diffOf('  patientId: string;'), options())).toEqual([]);
    expect(scanDiff(diffOf('  patientId: patient.id,'), options())).toEqual([]);
  });

  it('blocks credentials and session material', () => {
    expect(rules(scanDiff(diffOf('const password = "s3cr3t-real-value";'), options())))
      .toContain('structural:credential-literal');
    expect(rules(scanDiff(diffOf('Cookie: JSESSIONID=A1B2C3D4E5F6G7H8I9J0'), options())))
      .toContain('structural:session-cookie');
    expect(rules(scanDiff(diffOf('-----BEGIN RSA PRIVATE KEY-----'), options())))
      .toContain('structural:private-key');
  });

  it('leaves placeholder credentials alone', () => {
    // The dollar is spelled through a variable so that a placeholder like
    // `{TOKEN}` — which is a value the rule must NOT report — doesn't read to
    // no-template-curly-in-string as a backtick someone forgot.
    const dollar = '$';
    for (const value of ['changeme', 'your-api-key', 'process.env.TOKEN', `${dollar}{TOKEN}`, 'test-value']) {
      expect(scanDiff(diffOf(`const apiKey = "${value}";`), options())).toEqual([]);
    }
  });

  it('honours the shared allowlist of known-fake values', () => {
    const allowed = options({ allowlist: new Set(['homer@realdomain.com']) });
    expect(scanDiff(diffOf('login: homer@realdomain.com'), allowed)).toEqual([]);
  });
});

describe('denylist matching', () => {
  it('blocks the value itself', () => {
    const findings = scanDiff(diffOf('owner = "ryanexample@realdomain.com"'), options());
    expect(rules(findings)).toContain('denylist:email');
  });

  it('blocks a fragment of a phone number with no mask at all', () => {
    const findings = scanDiff(diffOf('// ends in 5577881'), options());
    expect(rules(findings)).toContain('denylist:phone');
  });

  it('blocks a masked email even though nothing about it looks like an address', () => {
    for (const masked of ['r***@realdomain.com', 'ryanexample@***.com', 'rya•••••••@realdomain.com']) {
      const findings = scanDiff(diffOf(`contact: ${masked}`), options());
      expect(rules(findings)).toContain('denylist:email');
    }
  });

  it('blocks a masked phone number in any punctuation', () => {
    for (const masked of ['(617) ***-7788', '617-555-**88', '+1 617 ### 7788']) {
      const findings = scanDiff(diffOf(`tel ${masked}`), options());
      expect(rules(findings)).toContain('denylist:phone');
    }
  });

  it('blocks a masked date of birth', () => {
    expect(rules(scanDiff(diffOf('born 1980-**-02'), options()))).toContain('denylist:dob');
  });

  it('blocks a name masked across two words', () => {
    // Neither word reveals enough on its own; rejoining them is what sees it.
    expect(rules(scanDiff(diffOf('patient: M*rigold Feath*******'), options()))).toContain('denylist:name');
  });

  it('blocks a record number that has been partly starred out', () => {
    expect(rules(scanDiff(diffOf('record 447**02'), options()))).toContain('denylist:mrn');
  });

  it('says in the finding that masking is not a fix', () => {
    const finding = scanDiff(diffOf('contact: r***@realdomain.com'), options())
      .find((candidate) => candidate.rule === 'denylist:email');
    expect(finding?.detail).toContain('masking a real value does not make it safe');
  });

  it('never puts the matched value in the finding', () => {
    const findings = scanDiff(diffOf('owner = "ryanexample@realdomain.com"'), options());
    for (const finding of findings) {
      expect(finding.preview).not.toContain('ryanexample');
      expect(finding.detail).not.toContain('ryanexample');
    }
  });

  it('will fire on an unrelated number that shares four digits, by design', () => {
    // The cost of catching "ends in 7788": four digits of a ten-digit number
    // collide with ordinary identifiers now and then. This is the knob for it,
    // and the test exists so that raising the default is a deliberate change
    // rather than a silent one.
    const epoch = 'const at = 1755000000;';
    expect(rules(scanDiff(diffOf(epoch), options()))).toContain('denylist:phone');

    const relaxed = parseDenylist('phone: +1 617 555 7788 | minRun=7');
    expect(scanDiff(diffOf(epoch), { ...options(), needles: relaxed.needles })).toEqual([]);
  });

  it('does not fire on a colleague at the same domain as a denylisted address', () => {
    // A fragment of an address is usually just its domain, and a domain shared
    // with everyone at a company identifies nobody.
    expect(rules(scanDiff(diffOf('cc: someoneelse@realdomain.com'), options())))
      .not.toContain('denylist:email');
  });

  it('blocks the local part of a denylisted address at another domain', () => {
    // The half that names a person, wherever it turns up.
    expect(rules(scanDiff(diffOf('cc: ryanexample@elsewhere.org'), options())))
      .toContain('denylist:email');
  });

  it('leaves an unrelated value of the same shape alone', () => {
    expect(rules(scanDiff(diffOf('tel (212) ***-4477'), options()))).not.toContain('denylist:phone');
  });

  it('runs the structural tier even with no denylist at all', () => {
    const bare: ScanOptions = { needles: [], allowlist: new Set(), skipPaths: [] };
    expect(rules(scanDiff(diffOf('to: someone@realdomain.com'), bare))).toContain('structural:email');
  });
});

describe('waivers', () => {
  it('honours an inline marker on the line', () => {
    const diff = diffOf('const sample = "someone@realdomain.com"; // pii-guard-allow: docs example');
    expect(scanDiff(diff, options())).toEqual([]);
  });

  it('honours a marker on the line above', () => {
    const diff = diffOf('// pii-guard-allow: fixture below is invented', 'const sample = "someone@realdomain.com";');
    expect(scanDiff(diff, options())).toEqual([]);
  });

  it('honours a skipped path', () => {
    const skipped = options({ skipPaths: ['src/**'] });
    expect(scanDiff(diffOf('to: someone@realdomain.com'), skipped)).toEqual([]);
  });
});

describe('opaque files', () => {
  const binaryDiff = (name: string) => [
    `diff --git a/${name} b/${name}`,
    'new file mode 100644',
    `Binary files /dev/null and b/${name} differ`,
  ].join('\n');

  it('warns about an added image without blocking the commit', () => {
    const findings = scanDiff(binaryDiff('docs/portal.png'), options());
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('warn');
    expect(findings[0]?.kind).toBe('binary');
  });

  it('says nothing about a binary that could not hold a record', () => {
    expect(scanDiff(binaryDiff('assets/font.woff2'), options())).toEqual([]);
  });

  it('reports warnings under their own heading, apart from the blocking list', () => {
    const findings = [
      ...scanDiff(binaryDiff('docs/portal.png'), options()),
      ...scanDiff(diffOf('to: someone@realdomain.com'), options()),
    ];
    const report = formatReport(findings, 'this commit');
    expect(report).toContain('1 blocking finding in this commit');
    expect(report).toContain('1 warning (not blocking)');
    expect(blocking(findings)).toHaveLength(1);
  });
});

describe('scanText', () => {
  it('checks a commit message the same way as a diff', () => {
    const findings = scanText('fix login for ryanexample@realdomain.com', '<commit message>', options());
    expect(rules(findings)).toContain('denylist:email');
    expect(findings[0]?.file).toBe('<commit message>');
  });

  it('numbers its lines from one', () => {
    const findings = scanText('first\nsecond\nssn 123-45-6789', '<body>', options());
    expect(findings[0]?.line).toBe(3);
  });
});

describe('candidate extraction', () => {
  it('anchors email candidates on the @, mask or no mask', () => {
    expect(emailCandidates('write to r***@x.com or a@b.co')).toEqual(['r***@x.com', 'a@b.co']);
    // Without the anchor an email needle would turn every ordinary word into a
    // candidate; a line with no @ yields nothing.
    expect(emailCandidates('no addresses here')).toEqual([]);
  });

  it('takes numeric candidates that are long enough to identify something', () => {
    expect(numericCandidates('v1.2.3')).toEqual([]);
    expect(numericCandidates('call 617-555-7788')).toEqual(['617-555-7788']);
  });

  it('rejoins adjacent masked words up to a window of four', () => {
    const windows = maskedWindows('patient M*rigold Feath***** admitted');
    expect(windows).toContain('M*rigold Feath*****');
    expect(windows.some((window) => window.split(' ').length > 4)).toBe(false);
  });
});

describe('globToRegExp', () => {
  it('keeps * inside a path segment and lets ** cross segments', () => {
    expect(globToRegExp('src/*.ts').test('src/a.ts')).toBe(true);
    expect(globToRegExp('src/*.ts').test('src/nested/a.ts')).toBe(false);
    expect(globToRegExp('src/**').test('src/nested/a.ts')).toBe(true);
    expect(globToRegExp('a.ts').test('ab.ts')).toBe(false);
  });
});
