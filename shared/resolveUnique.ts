/**
 * Resolve a human-supplied name to exactly one item, or refuse.
 *
 * Models are handed display names, not opaque ids, so every tool that takes a
 * "which one did you mean" argument needs the same lookup: exact match first,
 * then a unique partial match, and an error listing the candidates when more
 * than one survives. Picking a provider or a medication on the patient's
 * behalf is exactly the guess this codebase must never make.
 *
 * **Exact-before-partial is the whole point.** A substring-only matcher rejects
 * a perfectly correct name as ambiguous whenever another entry contains it:
 *
 *     resolveUnique(['Dr. Smith', 'Dr. Smithson'], 'Dr. Smith')
 *
 * every entry containing "smith" matches, so the caller is told to "be more
 * specific" about a name that could not have been more specific. Checking for
 * an exact match first settles it. `findProxyTarget` in
 * `scrapers/myChart/proxyContext.ts` has always done this for patient records;
 * this is the same rule for everything else.
 */

/** Honorifics that carry no identifying information in a provider name. */
const TITLE_WORDS = new Set([
  'dr', 'dr.', 'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.',
  'md', 'md.', 'do', 'do.', 'np', 'pa', 'rn',
]);

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function nameTokens(query: string): string[] {
  const all = normalize(query).split(/[\s,]+/).filter(Boolean);
  const withoutTitles = all.filter((t) => !TITLE_WORDS.has(t));
  // A query that is *nothing but* an honorific ("Dr") still narrows the list,
  // and reporting "multiple providers match" beats claiming no name was given.
  return withoutTitles.length > 0 ? withoutTitles : all;
}

export interface ResolveUniqueOptions<T> {
  /** The display name to match against, and the one shown in errors. */
  getName: (item: T) => string;
  /**
   * Other names the same item answers to — a medication's brand name against
   * its generic, say. Matched like the display name; never shown in errors,
   * since listing both names for one item reads as two items.
   */
  getAlternateNames?: (item: T) => string[];
  /** Singular noun for the error messages, e.g. "recipient", "medication". */
  label: string;
  /**
   * Strip honorifics (Dr., MD, RN) before matching. On for people, off for
   * things — a medication called "DO NOT SUBSTITUTE" should keep its words.
   */
  stripTitles?: boolean;
}

/**
 * Resolve `query` to exactly one item.
 *
 * @throws when the query is empty, matches nothing, or matches more than one
 * item — always listing the available names, so the caller can retry with
 * something specific instead of guessing.
 */
export function resolveUnique<T>(items: T[], query: string, opts: ResolveUniqueOptions<T>): T {
  const { getName, label } = opts;
  const available = () => items.map(getName).join(', ');
  const namesOf = (item: T): string[] =>
    [getName(item), ...(opts.getAlternateNames?.(item) ?? [])].filter(Boolean).map(normalize);

  const wanted = normalize(query);
  if (!wanted) {
    throw new Error(`No ${label} name given. Available: ${available()}`);
  }

  // 1. Exact match, case- and whitespace-insensitive. A correct name always
  //    wins, no matter how many other entries happen to contain it.
  const exact = items.filter((item) => namesOf(item).includes(wanted));
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1) {
    throw new Error(
      `More than one ${label} is called "${query}": ${exact.map(getName).join(', ')}. ` +
        'They cannot be told apart by name.',
    );
  }

  // 2. Every token present somewhere in one of the names, in any order.
  const tokens = opts.stripTitles === false ? [wanted] : nameTokens(query);
  const partial = items.filter((item) =>
    namesOf(item).some((name) => tokens.every((token) => name.includes(token))),
  );

  if (partial.length === 0) {
    throw new Error(`No ${label} matching "${query}". Available: ${available()}`);
  }
  if (partial.length > 1) {
    throw new Error(
      `Multiple ${label}s match "${query}": ${partial.map(getName).join(', ')}. Be more specific.`,
    );
  }
  return partial[0]!; // lengths 0 and >1 were ruled out above
}
