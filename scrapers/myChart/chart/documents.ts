import type { MyChartRequest } from '../core/myChartRequest';
import { RawCollector, type RawResponse } from '../core/rawResponse';
import { documentsProcessor, type DocumentsStandard } from './documents.processor';

export type { DocumentsStandard } from './documents.processor';
export { documentsProcessor } from './documents.processor';

/** `GET /app/documents` for the token, then `POST /api/documents/viewer/LoadOtherDocuments`. */
export async function fetchDocumentsRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken('/app/documents');
  await collector.postJson('/api/documents/viewer/LoadOtherDocuments', token, {});
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function getDocuments(mychartRequest: MyChartRequest): Promise<DocumentsStandard> {
  return documentsProcessor.standard(await fetchDocumentsRaw(mychartRequest));
}
