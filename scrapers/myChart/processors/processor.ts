/**
 * The processor contract and the four output modes.
 *
 * A scraper returns a {@link RawResponse}; its processor turns that into what
 * a caller asked for:
 *
 *   raw       — the HTTP body, untouched ({@link unwrapRaw})
 *   json      — the *standard object*: everything with any chance of being
 *               useful, MyChart's own field names, markup stripped into
 *               `<field>Text` fields, always-empty and UI-only fields removed
 *   standard  — the standard object rendered as markdown
 *   concise   — a projection of the standard object rendered as markdown
 *
 * `standard` and `json` are one object rendered two ways, and `concise` is a
 * projection of that same object, so a field can never be in one and not the
 * other. The rules every processor follows are in
 * `docs/processor-layer-proposal.md`; the ones that bite:
 *
 *   - A MyChart field is never edited in place or shadowed. A computed value
 *     gets a new name (`body` stays MyChart's, `bodyText` is the derived one).
 *   - Membership in a mode is decided by the field's NAME, never its value.
 *     A field on the list is emitted even when empty, so "no allergies on
 *     file" survives.
 *   - Errors pass through: a literal `null` from an unknown id, a scrape
 *     error, a WAF page — the processor returns it as-is in every mode.
 */

import { unwrapRaw, type RawResponse } from '../core/rawResponse';
import { renderMarkdown } from './markdown';

export type OutputMode = 'raw' | 'standard' | 'concise' | 'json';

export const OUTPUT_MODES: readonly OutputMode[] = ['raw', 'standard', 'concise', 'json'];

/**
 * What a programmatic caller gets when it says nothing. The library and the
 * CLI want data; the model-facing clients (MCPB, mobile agent) pass `concise`
 * themselves.
 */
export const DEFAULT_OUTPUT_MODE: OutputMode = 'json';

export function isOutputMode(value: unknown): value is OutputMode {
  return typeof value === 'string' && (OUTPUT_MODES as readonly string[]).includes(value);
}

export interface Processor<S = unknown> {
  /** Build the standard object from the envelope. Pure. */
  standard(raw: RawResponse): S;
  /** Project the standard object to the concise field list. Pure. */
  concise(standard: S): unknown;
}

/** Identity on both sides: for payloads that are already the designed shape. */
export function passthroughProcessor<S>(pick: (raw: RawResponse) => S): Processor<S> {
  return { standard: pick, concise: (s) => s };
}

/**
 * Render one capability's envelope in the requested mode.
 *
 * A scraper that returned something that is not the expected shape — the
 * standard object comes back `null` — is passed through in every mode rather
 * than rendered into nothing.
 */
export function renderOutput<S>(processor: Processor<S>, raw: RawResponse, mode: OutputMode): unknown {
  switch (mode) {
    case 'raw':
      return unwrapRaw(raw);
    case 'json':
      return processor.standard(raw);
    case 'standard':
      return renderMarkdown(processor.standard(raw));
    case 'concise': {
      const standard = processor.standard(raw);
      return renderMarkdown(standard === null || standard === undefined ? standard : processor.concise(standard));
    }
  }
}
