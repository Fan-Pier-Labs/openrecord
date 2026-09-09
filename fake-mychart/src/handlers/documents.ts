import { documentsPage } from '@/lib/html';
import { conformToShape } from '@/lib/shape';
import { nextDocumentsPage } from '@/lib/session';
import * as shapes from '@/data/realShapes';
import { html, json } from './respond';
import type { ExactRoutes } from './types';

export const documentsGet: ExactRoutes = {
  'app/document-center': () => html(documentsPage()),
};

/**
 * Documents per page, as measured on a live instance. The response says
 * nothing else about the walk — no count, no cursor, no `hasMore` — so a
 * short page is the only end-of-list signal a caller gets.
 */
const PAGE_SIZE = 25;

export const documentsPost: ExactRoutes = {
  /**
   * The cursor is session state, not a request parameter. `isInitialLoad`
   * rewinds it; anything else — including the `{}` body a caller sends when
   * it has not read the React bundle — asks for the page *after* the last one
   * served, which on a fresh session is an empty list with a 200. Modelling
   * that is the point: it is what made this endpoint read as an empty chart.
   */
  'api/documents/viewer/loadotherdocuments': async ({ request, ds }) => {
    const body = await request.json().catch(() => ({})) as { isInitialLoad?: boolean };
    const from = nextDocumentsPage(request.headers.get('cookie'), body.isInitialLoad === true, PAGE_SIZE);
    return json(conformToShape(shapes.loadOtherDocuments, {
      documents: ds.documents.documents.slice(from, from + PAGE_SIZE),
    }));
  },
};
