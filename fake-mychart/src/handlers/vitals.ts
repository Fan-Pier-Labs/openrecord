import { conformToShape } from '@/lib/shape';
import * as shapes from '@/data/realShapes';
import { vitalsPage } from '@/lib/html';
import { html, json } from './respond';
import type { ExactRoutes } from './types';

export const vitalsGet: ExactRoutes = {
  'trackmyhealth': () => html(vitalsPage()),
};

// Vitals / Flowsheets — two-call contract (definitions, then readings).
export const vitalsPost: ExactRoutes = {
  'api/track-my-health/getflowsheets': ({ ds }) => json(conformToShape(shapes.getFlowsheets, ds.vitals)),

  'api/track-my-health/getflowsheetreadings': async ({ request, ds }) => {
    // Real MyChart pages backwards through history: it returns readings at or
    // before endInstantIso, and numReadings caps distinct reading INSTANTS
    // (flowsheet columns), not individual readings. Honor both so the scraper's
    // paging loop is actually exercised.
    const body = await request.json();
    const endInstantIso: string = body?.endInstantIso || '9999-12-31T23:59:59';
    const numReadings: number = Number(body?.numReadings) || 200;

    const all = ds.vitalsReadings.flowsheet.readings;
    const inRange = all.filter((r) => r.instantTakenIso <= endInstantIso);
    const instants = [...new Set(inRange.map((r) => r.instantTakenIso))].sort().reverse();
    const page = instants.slice(0, numReadings);
    const pageSet = new Set(page);

    return json(conformToShape(shapes.getFlowsheetReadings, {
      ...ds.vitalsReadings,
      flowsheet: {
        ...ds.vitalsReadings.flowsheet,
        readings: inRange.filter((r) => pageSet.has(r.instantTakenIso)),
        hasMoreData: instants.length > page.length,
      },
    }));
  },
};
