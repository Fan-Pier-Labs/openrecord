/**
 * The organization's contact lines, read off the login shell.
 *
 * Every pre-login page registers a block of string "mnemonics" for the page JS
 * to substitute into UI copy:
 *
 *   $$WP.Strings.addMnemonic("@MYCHART@HELPDESKPHONE@","<span dir='ltr'><a href='tel:5550100100'>555-010-0100</a></span>", false, "Global", $$WP.Strings.EncodingTypes.None)
 *   $$WP.Strings.addMnemonic("@MYCHART@ORGNAME@",HTMLUnencode("Springfield General Hospital"), false, "Global")
 *
 * Verified on five instances spanning both scheduling-bundle generations: the
 * mnemonic names are identical everywhere; only the values differ. Three
 * things about the values bite:
 *
 *  - **Epic ships placeholders.** An org that never set a line leaves
 *    `(555) 555-5555` / `tel:5555555555` in place, and the support email
 *    defaults to `MyChartSupport@DoNotUse.DoNotUse`. Both are reported as
 *    null, never as a number to call.
 *  - **Values are HTML**, usually a `tel:` anchor, sometimes a bare span for a
 *    vanity number ("800-4Sprng") that has no `tel:` link at all.
 *  - **`HTMLUnencode(...)` wraps the text ones**, so the JS string literal
 *    still holds entities (`&amp;`, `&#39;`) after the script is parsed.
 *
 * So each value is read through two parsers and no hand-written scanner:
 * `inlineScript` (acorn) turns the script into calls and their string
 * arguments, then cheerio turns each argument's HTML into text.
 */

import * as cheerio from 'cheerio';

import { parseInlineScripts, readCallArguments } from './inlineScript';
import type { OrgProfile, PhoneNumber } from './types';

const MNEMONIC_CALL = '$$WP.Strings.addMnemonic';
const MNEMONIC_NAME = /^@MYCHART@([A-Z_]+)@$/;

const PLACEHOLDER_DIGITS = '5555555555';
const PLACEHOLDER_EMAIL_DOMAIN = 'donotuse.donotuse';

/** Every `@MYCHART@…@` mnemonic on the page, values still raw HTML. */
export function parseMnemonics(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of readCallArguments(parseInlineScripts(html, 'addMnemonic'), MNEMONIC_CALL)) {
    if (typeof name !== 'string' || typeof value !== 'string') continue;
    const key = MNEMONIC_NAME.exec(name)?.[1];
    if (key) out[key] = value;
  }
  return out;
}

/** A parsed fragment's text: tags dropped, entities decoded, spacing collapsed. */
function textOf($: cheerio.CheerioAPI): string {
  return $.root().text().replace(/\s+/g, ' ').trim();
}

/** One mnemonic value's HTML as plain text. */
function toText(html: string): string {
  return textOf(cheerio.load(html, null, false));
}

/** Turn one phone mnemonic's HTML into a number, or null for empty/placeholder. */
export function parsePhone(raw: string | undefined): PhoneNumber | null {
  if (!raw) return null;
  const $ = cheerio.load(raw, null, false);
  const display = textOf($);
  if (!display) return null;

  const href = $('a[href]').first().attr('href')?.trim() ?? '';
  const telDigits = (/^tel:(.+)$/i.exec(href)?.[1] ?? '').replace(/\D/g, '');
  const displayDigits = display.replace(/\D/g, '');
  // A vanity number only has digits for its prefix; `tel:` is authoritative
  // when it exists, and a display that is all digits speaks for itself.
  const digits = telDigits || (/^[\d\s().+-]+$/.test(display) ? displayDigits : '');

  if (digits === PLACEHOLDER_DIGITS || /555[-. ]?5555/.test(display)) return null;
  return { display, digits: digits || null };
}

/** The support email, or null for empty / Epic's DoNotUse placeholder. */
export function parseEmail(raw: string | undefined): string | null {
  if (!raw) return null;
  const email = toText(raw);
  if (!email.includes('@')) return null;
  if (email.toLowerCase().endsWith('@' + PLACEHOLDER_EMAIL_DOMAIN)) return null;
  return email;
}

function textOrNull(raw: string | undefined): string | null {
  if (!raw) return null;
  return toText(raw) || null;
}

/** Read the organization's profile out of any pre-login page's HTML. */
export function parseOrgProfile(html: string): OrgProfile {
  const m = parseMnemonics(html);
  return {
    organizationName: textOrNull(m.ORGNAME) ?? textOrNull(m.MYORGNAME),
    portalBrand: textOrNull(m.APPTITLE),
    mountPath: textOrNull(m.ABSOLUTEURL),
    phones: {
      helpDesk: parsePhone(m.HELPDESKPHONE),
      scheduling: parsePhone(m.SCHEDULINGPHONE),
      billing: parsePhone(m.BILLINGPHONE),
    },
    supportEmail: parseEmail(m.HELPEMAIL),
  };
}

/**
 * Does this page carry the mnemonic block at all? False for a non-MyChart page.
 *
 * A presence check, so it stays a regex: there is no value to extract, and
 * parsing every inline script to answer a boolean is not worth the work.
 */
export function hasOrgProfile(html: string): boolean {
  return /addMnemonic\(\s*"@MYCHART@(ORGNAME|APPTITLE)@"/.test(html);
}
