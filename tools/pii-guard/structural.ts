/**
 * The rules that need no prior knowledge: things that are identifiers by their
 * shape alone.
 *
 * This tier is the safety net under the denylist. It catches the value you
 * never thought to list — a colleague's number, a patient's record number
 * pasted out of a debugging session — at the cost of being the tier that can be
 * wrong. Every rule here therefore has an escape: a value in `allowlist.txt`,
 * an inline `pii-guard-allow` comment, or a path in `.pii-guard-allow`.
 *
 * The bar for adding a rule is that its false-positive rate on THIS repo is
 * near zero. That is why there is no "medical terminology" rule: a repo whose
 * job is scraping charts says `diagnosis` and `procedure` on thousands of
 * legitimate lines, and a rule that cries wolf there would get the whole guard
 * switched off. Real medical detail belongs on the denylist, where it is exact.
 */

import { redact } from './match';
import type { Finding, PiiKind, Severity } from './types';

interface StructuralRule {
  id: string;
  kind: PiiKind;
  severity: Severity;
  /** Must be global: every match on a line is reported, not just the first. */
  pattern: RegExp;
  detail: string;
  /**
   * Second look at a match before it becomes a finding. Returns the text to
   * report, or null to drop it. This is where a rule's cheap regex gets its
   * expensive judgement — Luhn for a card, "is this actually a date" for a DOB.
   */
  refine?: (match: RegExpExecArray, line: string) => string | null;
}

/** Values that look like identifiers but are documented fiction. */
const BUILTIN_ALLOWED_DOMAINS = new Set([
  'example.com', 'example.org', 'example.net', 'example.edu',
  'test.com', 'test.local', 'localhost', 'invalid', 'domain.com',
  'email.com', 'mychart.local', 'fake-mychart.local', 'sentry.io',
  'users.noreply.github.com', 'noreply.github.com',
]);

/**
 * An address that cannot belong to anyone, because its domain is reserved for
 * documentation and testing (RFC 2606) or is one of the conventional
 * placeholders. Used by both tiers: a fictional address is not a leak even when
 * it happens to share characters with a real one on the denylist.
 */
export function isFictionalAddress(address: string): boolean {
  const at = address.lastIndexOf('@');
  if (at === -1) return false;
  const domain = address.slice(at + 1).toLowerCase();
  return BUILTIN_ALLOWED_DOMAINS.has(domain) || /\.(?:example|test|invalid|localhost|local)$/.test(domain);
}

/** Placeholder secret values — present so the code compiles, not to be used. */
const PLACEHOLDER_SECRETS =
  /^(?:changeme|change_me|placeholder|redacted|xxx+|\.{3,}|your[-_a-z]*|my[-_a-z]*|test[-_a-z0-9]*|example[-_a-z0-9]*|dummy[-_a-z0-9]*|fake[-_a-z0-9]*|secret|password|hunter2|<[^>]*>|\$\{[^}]*\}|process\.env[.\w]*)$/i;

/**
 * Fictional-by-convention phone numbers: the 555-0100..555-0199 block reserved
 * for fiction, plus the obviously-typed-by-hand ones.
 */
function isFictionalPhone(digits: string): boolean {
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (ten.length !== 10) return false;
  if (/^(\d)\1{9}$/.test(ten)) return true;
  if (ten === '1234567890' || ten === '0123456789') return true;
  return /^\d{3}55501\d{2}$/.test(ten);
}

/**
 * Issuer prefixes for the major card networks.
 *
 * Luhn alone is not a card test: roughly one in ten arbitrary sixteen-digit
 * numbers passes it, and this repo has plenty of long numeric identifiers.
 * Requiring a real issuer prefix as well takes the rule from "occasionally
 * wrong" to "essentially never wrong".
 */
const CARD_ISSUER = /^(?:4\d{12,18}|5[1-5]\d{14}|2[2-7]\d{14}|3[47]\d{13}|6(?:011|5\d{2})\d{12})$/;

/** Luhn check — what separates a card number from sixteen digits. */
export function luhnValid(digits: string): boolean {
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    const digit = Number.parseInt(digits[i] ?? '', 10);
    if (Number.isNaN(digit)) return false;
    if (double) {
      const doubled = digit * 2;
      sum += doubled > 9 ? doubled - 9 : doubled;
    } else {
      sum += digit;
    }
    double = !double;
  }
  return sum % 10 === 0;
}

const RULES: StructuralRule[] = [
  {
    id: 'ssn',
    kind: 'ssn',
    severity: 'block',
    // The excluded prefixes are never issued, which is what test fixtures use.
    pattern: /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g,
    detail: 'looks like a US Social Security number',
  },
  {
    id: 'ssn-labelled',
    kind: 'ssn',
    severity: 'block',
    pattern: /\b(?:ssn|social security(?: number)?)\b\D{0,12}(\d{9})\b/gi,
    detail: 'a nine-digit value labelled as a Social Security number',
  },
  {
    id: 'card',
    kind: 'card',
    severity: 'block',
    pattern: /\b(?:\d[ -]?){12,18}\d\b/g,
    detail: 'has a card issuer prefix and passes the Luhn check',
    refine: (match) => {
      const digits = match[0].replace(/\D/g, '');
      return CARD_ISSUER.test(digits) && luhnValid(digits) ? match[0] : null;
    },
  },
  {
    id: 'email',
    kind: 'email',
    severity: 'block',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    detail: 'is an email address',
    refine: (match) => {
      const address = match[0].toLowerCase();
      if (isFictionalAddress(address)) return null;
      // Service addresses that exist to be public.
      if (/^(?:noreply|no-reply|support|security|help|info|hello|contact|abuse|admin)@/.test(address)) return null;
      return match[0];
    },
  },
  {
    id: 'phone-formatted',
    kind: 'phone',
    severity: 'block',
    // Two separators required. An unpunctuated ten-digit run is far more often
    // an epoch, an id or a hash than a phone number, and blocking those would
    // make the guard unusable; the labelled rule below catches the real ones.
    pattern: /(?:\+\d{1,2}[ .-])?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/g,
    detail: 'looks like a phone number',
    refine: (match) => (isFictionalPhone(match[0].replace(/\D/g, '')) ? null : match[0]),
  },
  {
    id: 'phone-labelled',
    kind: 'phone',
    severity: 'block',
    pattern: /\b(?:phone|tel|telephone|mobile|cell|fax|sms)\b\W{0,12}(\+?\d[\d ().-]{8,}\d)/gi,
    detail: 'a number labelled as a phone number',
    refine: (match) => {
      const value = match[1] ?? '';
      const digits = value.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 15) return null;
      return isFictionalPhone(digits) ? null : value;
    },
  },
  {
    id: 'phone-e164',
    kind: 'phone',
    severity: 'block',
    pattern: /\+1\d{10}\b/g,
    detail: 'is an E.164 US phone number',
    refine: (match) => (isFictionalPhone(match[0].slice(1)) ? null : match[0]),
  },
  {
    id: 'dob',
    kind: 'dob',
    severity: 'block',
    pattern:
      /\b(?:dob|d\.o\.b\.?|date of birth|birth ?date|born(?: on)?)\b\W{0,4}((?:\d{1,4}[-/]\d{1,2}[-/]\d{1,4})|(?:[A-Za-z]{3,9} \d{1,2},? \d{4}))/gi,
    detail: 'a date labelled as a date of birth',
  },
  {
    id: 'record-number',
    kind: 'mrn',
    severity: 'block',
    pattern:
      /\b(?:mrn|medical record (?:number|no\.?|#)|patient ?id|patient ?number|accession(?: number)?)\b\W{0,4}["']?([A-Za-z0-9-]{4,})["']?/gi,
    detail: 'a value labelled as a medical record, patient or accession number',
    refine: (match) => {
      const value = match[1] ?? '';
      // A type annotation (`patientId: string`) and a variable reference are
      // not records. Four digits is what makes it an identifier.
      const digitCount = (value.match(/\d/g) ?? []).length;
      return digitCount >= 4 ? value : null;
    },
  },
  {
    id: 'private-key',
    kind: 'secret',
    severity: 'block',
    pattern: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/g,
    detail: 'is the start of a private key',
  },
  {
    id: 'jwt',
    kind: 'secret',
    severity: 'block',
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    detail: 'is a JSON Web Token',
  },
  {
    id: 'bearer',
    kind: 'secret',
    severity: 'block',
    pattern: /\bbearer\s+[A-Za-z0-9._~+/-]{20,}=*/gi,
    detail: 'is a bearer token',
  },
  {
    id: 'session-cookie',
    kind: 'secret',
    severity: 'block',
    pattern:
      /\b(?:MyChart_Session|JSESSIONID|EPIC[A-Za-z_]*|__RequestVerificationToken|ASP\.NET_SessionId)\s*[=:]\s*["']?([A-Za-z0-9%._+/-]{16,})/g,
    detail: 'is a session cookie with a real-looking value',
  },
  {
    id: 'credential-literal',
    kind: 'secret',
    severity: 'block',
    pattern:
      /\b(?:password|passwd|pwd|api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|client[_-]?secret|totp[_-]?secret)\b\s*[:=]\s*["']([^"']{6,})["']/gi,
    detail: 'assigns a literal credential',
    refine: (match) => {
      const value = match[1] ?? '';
      return PLACEHOLDER_SECRETS.test(value) ? null : value;
    },
  },
];

/** Every structural rule's id, for documentation and for tests to assert on. */
export const STRUCTURAL_RULE_IDS = RULES.map((rule) => rule.id);

/**
 * Run every structural rule over one line.
 *
 * `allowlist` holds lowercased literals that are known fiction; a match equal
 * to one of them is dropped whichever rule found it, so a fake identity used
 * across many fixtures is declared once.
 */
export function scanLineStructurally(
  text: string,
  file: string,
  line: number,
  allowlist: Set<string>,
): Finding[] {
  const findings: Finding[] = [];
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    for (let match = rule.pattern.exec(text); match !== null; match = rule.pattern.exec(text)) {
      // A zero-length match would spin forever; no rule should produce one, but
      // a future edit to a pattern shouldn't be able to hang a commit.
      if (match[0].length === 0) {
        rule.pattern.lastIndex += 1;
        continue;
      }
      const matched = rule.refine ? rule.refine(match, text) : match[0];
      if (matched === null) continue;
      if (allowlist.has(matched.toLowerCase().trim())) continue;
      findings.push({
        file,
        line,
        rule: `structural:${rule.id}`,
        kind: rule.kind,
        severity: rule.severity,
        preview: redact(matched),
        detail: `a value on this line ${rule.detail}`,
      });
    }
  }
  return findings;
}
