import type { MyChartRequest } from './../core/myChartRequest';
import { RawCollector, type RawResponse } from '../core/rawResponse';
import { logger } from '../../../shared/logger';
import { list, rec, text } from '../processors/read';
import { vitalsProcessor, type VitalsStandard } from './vitals.processor';

export type {
  VitalsStandard,
  FlowsheetStandard,
  FlowsheetRowStandard,
  FlowsheetRowGroupStandard,
  VitalReadingStandard,
} from './vitals.processor';
export { vitalsProcessor, readingValue } from './vitals.processor';

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
const MAX_PAGES = 100; // safety bound for accounts with long histories

/**
 * Track My Health vitals (Blood Pressure, Weight, Pulse, etc.).
 *
 * MyChart splits this across TWO endpoints:
 *   1. GetFlowsheets        → flowsheet definitions (episodeId + row metadata; NO values)
 *   2. GetFlowsheetReadings → the actual readings for an episode, paginated
 *
 * Every page is recorded; the processor joins them back into one flowsheet
 * per episode.
 */
export async function fetchVitalsRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken('/app/track-my-health');

  const listBody = rec(await collector.postJson('/api/track-my-health/GetFlowsheets', token, { organizationId: '' }));

  for (const fs of list(listBody.flowsheets)) {
    const episodeId = text(rec(fs).episodeId);
    if (!episodeId) continue;

    let endInstantIso = defaultEndInstantIso();
    for (let page = 0; page < MAX_PAGES; page++) {
      const body = rec(
        await collector.postJson('/api/track-my-health/GetFlowsheetReadings', token, {
          episodeId,
          endInstantIso,
          numReadings: PAGE_SIZE,
        }),
      );
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

  logger.debug(`vitals: ${collector.requests.length} requests recorded`);
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function getVitals(mychartRequest: MyChartRequest): Promise<VitalsStandard> {
  return vitalsProcessor.standard(await fetchVitalsRaw(mychartRequest));
}
