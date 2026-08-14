/**
 * Turning findings into something a human — or an agent — will act on.
 *
 * The message has one job beyond listing locations: say what the fix is. A
 * blocked commit with no stated remedy gets "fixed" with `--no-verify`, and an
 * agent that is told only "blocked" will try the same command again. So every
 * report ends with the instruction, in the imperative, and names the one thing
 * that is not an acceptable response.
 *
 * No report ever prints a matched value. See the note in `types.ts`.
 */

import type { Finding } from './types';

export function blocking(findings: Finding[]): Finding[] {
  return findings.filter((finding) => finding.severity === 'block');
}

function location(finding: Finding): string {
  return finding.line > 0 ? `${finding.file}:${finding.line}` : finding.file;
}

/** The shared "here is what to do about it" paragraph. */
const REMEDY = [
  'Fix it by deleting the value or replacing it with an obviously fictional one',
  '(example.com addresses, 555-01xx phone numbers, a made-up name), then stage the fix and retry.',
  'Partly masking a real value is NOT a fix: the surviving characters still identify a real person,',
  'and this guard is built to catch exactly that. Do not bypass the check with --no-verify or',
  'PII_GUARD_SKIP — if a finding is genuinely a false positive, add a `pii-guard-allow` comment on',
  'the line (with a reason) or add the value to tools/pii-guard/allowlist.txt, and say so.',
].join(' ');

/** Human-readable report for a terminal. */
export function formatReport(findings: Finding[], subject: string): string {
  const blocked = blocking(findings);
  const warnings = findings.filter((finding) => finding.severity === 'warn');
  const lines: string[] = [];

  if (blocked.length > 0) {
    lines.push(`PII guard: ${blocked.length} blocking finding${blocked.length === 1 ? '' : 's'} in ${subject}.`);
    lines.push('');
    for (const finding of blocked) {
      lines.push(`  ${location(finding)}  [${finding.rule}]`);
      lines.push(`      ${finding.detail} (${finding.preview})`);
    }
    lines.push('');
    lines.push(REMEDY);
  }

  if (warnings.length > 0) {
    if (blocked.length > 0) lines.push('');
    lines.push(`PII guard: ${warnings.length} warning${warnings.length === 1 ? '' : 's'} (not blocking):`);
    for (const finding of warnings) {
      lines.push(`  ${location(finding)}  ${finding.detail}`);
    }
  }

  return lines.join('\n');
}

/**
 * The `permissionDecisionReason` handed back to Claude Code.
 *
 * One paragraph, because it is read as prose rather than rendered: locations
 * first so the model knows where to go, remedy last so it is the most recent
 * thing in the instruction.
 */
export function denyReason(findings: Finding[], subject: string): string {
  const blocked = blocking(findings);
  const list = blocked
    .map((finding) => `${location(finding)} — ${finding.detail} (${finding.preview}) [${finding.rule}]`)
    .join('; ');
  return [
    `Blocked by the PII guard: ${subject} contains ${blocked.length} finding${blocked.length === 1 ? '' : 's'}`,
    `that look like real personal or patient data. Findings: ${list}.`,
    REMEDY,
    'The values themselves are deliberately not quoted here — open the files and look.',
  ].join(' ');
}
