/**
 * Documents processor. Field decisions: docs/processor-layer-proposal.md, `get_documents`.
 *
 * `LoadOtherDocuments` has no captured skeleton — the six fields the old
 * scraper read exist only in the fixture — so each document passes through
 * whole (rule 10) and concise is identical to standard. Once a capture
 * exists, concise narrows to title, type, date and provider.
 */

import { bodyOf, type RawResponse } from '../core/rawResponse';
import { passthroughProcessor, type Processor } from '../processors/processor';
import { list, rec } from '../processors/read';

export interface DocumentsStandard {
  /** One document per element, as MyChart sent it (shape uncaptured). */
  documents: unknown[];
}

export const documentsProcessor: Processor<DocumentsStandard> = passthroughProcessor((raw: RawResponse) => ({
  documents: list(rec(bodyOf(raw, 'LoadOtherDocuments')).documents),
}));
