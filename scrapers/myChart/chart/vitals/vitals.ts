// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { SessionExpiredError } from '../../core/makeAuthenticatedRequest';
import type { MyChartRequest } from '../../core/myChartRequest';
import { RawCollector, type RawResponse } from '../../core/rawResponse';
import { logger } from '../../../../shared/logger';
import { list, rec, text } from '../../processors/read';
import type { GetFlowsheetReadings, GetFlowsheets } from './mychart.types';
import { MAX_READING_PAGES, vitalsProcessor, type VitalsStandard } from './vitals.processor';

export type {
  VitalsStandard,
  FlowsheetStandard,
  FlowsheetRowStandard,
  FlowsheetRowGroupStandard,
  VitalReadingStandard,
  UnloadedFlowsheetStandard,
  TruncatedFlowsheetStandard,
} from './vitals.processor';
export { vitalsProcessor, readingValue, displayValue } from './vitals.processor';

/** End-of-day tomorrow, formatted as MyChart expects (no timezone suffix). */
function defaultEndInstantIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T23:59:59`;
}

// NOTE: numReadings caps distinct reading INSTANTS (flowsheet columns), not
// individual readings. At 200 this silently truncated history to the most recent
// 200 instants — ~693 readings across 7 vital types, which looked like plenty and
// hid the cap for months.
const PAGE_SIZE = 1000;

/**
 * Track My Health vitals (Blood Pressure, Weight, Pulse, etc.).
 *
 * MyChart splits this across TWO endpoints:
 *   1. GetFlowsheets        → flowsheet definitions (episodeId + row metadata; NO values)
 *   2. GetFlowsheetReadings → the actual readings for an episode, paginated
 *
 * Every page is recorded; the processor joins them back into one flowsheet
 * per episode.
 *
 * One flowsheet's readings failing must not cost the others theirs, so a
 * failed page ends that flowsheet's paging and the processor reports it as
 * unloaded (no page answered) or cut short (an older page failed). Only every
 * flowsheet failing on its first page throws: nothing loaded to return.
 */
export async function fetchVitalsRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken('/app/track-my-health');

  const listBody = rec<GetFlowsheets>(await collector.postJson('/api/track-my-health/GetFlowsheets', token, { organizationId: '' }));

  const failures: Error[] = [];
  let flowsheetCount = 0;
  let loadedCount = 0;
  for (const fs of list(listBody.flowsheets)) {
    const episodeId = text(rec(fs).episodeId);
    if (!episodeId) continue;
    flowsheetCount += 1;

    let endInstantIso = defaultEndInstantIso();
    for (let page = 0; page < MAX_READING_PAGES; page++) {
      let answer: unknown;
      try {
        const { body, failure } = await collector.send(
          {
            path: '/api/track-my-health/GetFlowsheetReadings',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', __RequestVerificationToken: token },
            body: JSON.stringify({ episodeId, endInstantIso, numReadings: PAGE_SIZE }),
          },
          { tolerateFailure: true },
        );
        if (failure) {
          failures.push(failure);
          break;
        }
        answer = body;
      } catch (err) {
        if (err instanceof SessionExpiredError) throw err;
        failures.push(err as Error);
        break;
      }
      if (page === 0) loadedCount += 1;
      const body = rec<GetFlowsheetReadings>(answer);
      const data = rec(body.flowsheet);
      if (Object.keys(data).length === 0) break;

      let oldestInstant: string | undefined;
      for (const r of list(data.readings)) {
        const instant = text(rec(r).instantTakenIso);
        if (instant && (oldestInstant === undefined || instant < oldestInstant)) oldestInstant = instant;
      }

      // Deliberately NOT keyed off hasMoreData: MyChart reports it false while
      // older readings still exist, which is what capped history at one page.
      // Walk back from the oldest instant this page returned and stop only when
      // a request fails to reach any further back.
      if (!oldestInstant || oldestInstant >= endInstantIso) break;
      endInstantIso = oldestInstant;
    }
  }

  if (flowsheetCount > 0 && loadedCount === 0) throw failures[0]!;

  logger.debug(`vitals: ${collector.requests.length} requests recorded`);
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function getVitals(mychartRequest: MyChartRequest): Promise<VitalsStandard> {
  return vitalsProcessor.standard(await fetchVitalsRaw(mychartRequest));
}
