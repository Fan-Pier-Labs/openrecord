import type { MyChartRequest } from '../../core/myChartRequest';
import { RawCollector, type RawResponse } from '../../core/rawResponse';
import { list, rec } from '../../processors/read';
import { logger } from '../../../../shared/logger';
import { documentsProcessor, type DocumentsStandard } from './documents.processor';

export type { DocumentsStandard, DocumentStandard } from './documents.processor';
export { documentsProcessor } from './documents.processor';

const LOAD_OTHER_DOCUMENTS = '/api/documents/viewer/LoadOtherDocuments';

/**
 * Documents per page. Epic's own Document Center hides its "Load more" button
 * once a page comes back with fewer than 25, which is the only signal the
 * response carries — there is no count, no cursor and no `hasMore` flag.
 */
const PAGE_SIZE = 25;

/** ~1000 documents. Guarantees termination if a page ever stops shrinking. */
const MAX_PAGES = 40;

/**
 * `GET /app/document-center` for the token, then walk `LoadOtherDocuments`.
 *
 * **`isInitialLoad` is not optional.** The cursor is server-side session
 * state: `true` rewinds it and answers the first 25, anything else answers
 * the next 25 from wherever the session left off. Posting `{}` on a fresh
 * session therefore asks for the page after the last one — of a walk that
 * never started — and MyChart answers `{"documents":[]}` with a 200. That is
 * indistinguishable from an empty chart, and it is what this scraper sent
 * until now: an account with 42 documents read as none.
 *
 * The activity is `/app/document-center`; `/app/documents` is not a page on
 * any instance and redirects to Home, which still carries a usable token but
 * costs `RawCollector` its "this activity is not served here" signal.
 */
export async function fetchDocumentsRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken('/app/document-center');

  let pages = 0;
  let count = PAGE_SIZE;
  while (count === PAGE_SIZE && pages < MAX_PAGES) {
    const body = await collector.postJson(LOAD_OTHER_DOCUMENTS, token, { isInitialLoad: pages === 0 });
    count = list(rec(body).documents).length;
    pages++;
  }
  if (count === PAGE_SIZE) {
    logger.debug(`documents: hit page cap (${MAX_PAGES}); some older documents may be omitted`);
  }
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function getDocuments(mychartRequest: MyChartRequest): Promise<DocumentsStandard> {
  return documentsProcessor.standard(await fetchDocumentsRaw(mychartRequest));
}
