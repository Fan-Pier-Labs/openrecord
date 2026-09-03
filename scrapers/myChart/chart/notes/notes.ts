import type { MyChartRequest } from '../../core/myChartRequest';
import { RawCollector, type RawResponse } from '../../core/rawResponse';
import {
  noteContentProcessor,
  visitNotesProcessor,
  type NoteContentStandard,
  type VisitNotesStandard,
} from './notes.processor';

export type { VisitNotesStandard, VisitNoteStandard, NoteContentStandard } from './notes.processor';
export { visitNotesProcessor, noteContentProcessor } from './notes.processor';

/**
 * The CSRF token. Uses /Visits/VisitsList for consistency with the sibling
 * visits scraper.
 */
const VISITS_PAGE = '/Visits/VisitsList';

/**
 * Surface F5 Volterra WAF rejections (200 OK with a text/html "Request
 * Rejected" body) as a clear error rather than letting the caller find an
 * HTML string where JSON was expected. Any other non-JSON answer is reported
 * as a probably-expired session.
 */
export function requireJsonBody(
  result: { response: Response; text: string },
  endpoint: string,
): void {
  const contentType = result.response.headers.get('content-type') || '';
  if (contentType.includes('json')) return;
  const server = result.response.headers.get('server') || '';
  const bodyPreview = result.text.slice(0, 200);
  if (server.includes('volt') || bodyPreview.includes('Request Rejected')) {
    throw new Error(
      `MyChart WAF (${server || 'unknown'}) rejected ${endpoint}. ` +
        `The session is likely valid but the WAF blocked this request shape. ` +
        `Try refreshing your MyChart login.`,
    );
  }
  throw new Error(
    `Expected JSON from ${endpoint} but got ${contentType || 'no content-type'}. Session may have expired.`,
  );
}

async function postJsonChecked(collector: RawCollector, path: string, token: string, body: unknown): Promise<void> {
  const result = await collector.send({
    path,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', __requestverificationtoken: token },
    body: JSON.stringify(body),
  });
  requireJsonBody(result, path);
}

/** `POST /api/visit-notes/GetVisitNotes` `{ CSN, FromPvdPage }` — the notes attached to a past visit. */
export async function fetchVisitNotesRaw(mychartRequest: MyChartRequest, csn: string): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken(VISITS_PAGE + '?noCache=' + Math.random());
  await postJsonChecked(collector, '/api/visit-notes/GetVisitNotes', token, { CSN: csn, FromPvdPage: true });
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. `null` for an unknown CSN. */
export async function getVisitNotes(mychartRequest: MyChartRequest, csn: string): Promise<VisitNotesStandard | null> {
  return visitNotesProcessor.standard(await fetchVisitNotesRaw(mychartRequest, csn));
}

/**
 * `POST /api/report-content/LoadReportContent` with `OPEN_NOTES` — one note's
 * rendered HTML. `lrpId` is shared by every note of a visit; `hnoId`/`hnoDat`
 * identify the note.
 */
export async function fetchNoteContentRaw(
  mychartRequest: MyChartRequest,
  params: { csn: string; lrpId: string; hnoId: string; hnoDat: string },
): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken(VISITS_PAGE + '?noCache=' + Math.random());
  await postJsonChecked(collector, '/api/report-content/LoadReportContent', token, {
    reportMnemonic: 'OPEN_NOTES',
    reportID: params.lrpId,
    contextID: params.hnoId,
    contextDAT: params.hnoDat,
    contextINI: 'HNO',
    csn: params.csn,
    isFullReportPage: false,
    uniqueClass: 'EID-1',
    nonce: '',
  });
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function getNoteContent(
  mychartRequest: MyChartRequest,
  params: { csn: string; lrpId: string; hnoId: string; hnoDat: string },
): Promise<NoteContentStandard | null> {
  return noteContentProcessor.standard(await fetchNoteContentRaw(mychartRequest, params));
}

/** Same endpoint with `AMB_AVS` — the After Visit Summary for a past visit. */
export async function fetchVisitAvsRaw(mychartRequest: MyChartRequest, csn: string): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken(VISITS_PAGE + '?noCache=' + Math.random());
  await postJsonChecked(collector, '/api/report-content/LoadReportContent', token, {
    reportMnemonic: 'AMB_AVS',
    reportID: '',
    csn,
    isFullReportPage: false,
    uniqueClass: 'EID-1',
    nonce: '',
  });
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function getVisitAVS(mychartRequest: MyChartRequest, csn: string): Promise<NoteContentStandard | null> {
  return noteContentProcessor.standard(await fetchVisitAvsRaw(mychartRequest, csn));
}
