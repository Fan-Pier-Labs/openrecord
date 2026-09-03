import type { MyChartRequest } from '../../core/myChartRequest';
import { RawCollector, type RawResponse } from '../../core/rawResponse';
import {
  letterDetailsProcessor,
  lettersProcessor,
  type LetterDetailsStandard,
  type LettersStandard,
} from './letters.processor';

export type { LettersStandard, LetterStandard, LetterDetailsStandard } from './letters.processor';
export { lettersProcessor, letterDetailsProcessor } from './letters.processor';

/** `GET /app/letters` for the token, then `POST /api/letters/GetLettersList`. */
export async function fetchLettersRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken('/app/letters');
  await collector.postJson('/api/letters/GetLettersList', token, {});
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function getLetters(mychartRequest: MyChartRequest): Promise<LettersStandard> {
  return lettersProcessor.standard(await fetchLettersRaw(mychartRequest));
}

/**
 * `POST /api/letters/GetLetterDetails` `{ hnoId, csn }`. MyChart needs the
 * encounter (csn) alongside the note id; sending only one returns someone
 * else's letter or nothing at all.
 */
export async function fetchLetterDetailsRaw(mychartRequest: MyChartRequest, hnoId: string, csn: string): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken('/app/letters');
  await collector.postJson('/api/letters/GetLetterDetails', token, { hnoId, csn });
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. `null` for an unknown letter. */
export async function getLetterDetails(
  mychartRequest: MyChartRequest,
  hnoId: string,
  csn: string,
): Promise<LetterDetailsStandard | null> {
  return letterDetailsProcessor.standard(await fetchLetterDetailsRaw(mychartRequest, hnoId, csn));
}
