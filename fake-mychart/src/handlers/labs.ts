import { conformToShape } from '@/lib/shape';
import * as shapes from '@/data/realShapes';
import { testResultsPage } from '@/lib/html';
import { isLegacyEpicVersion } from '@/lib/epicVersion';
import { html, json } from './respond';
import type { ExactRoutes } from './types';

/**
 * The November 2025 release (two of the three captured instances) attaches
 * three extra fields to every test result: `canGenerateLLMSummary`,
 * `feedbackSubmitted` and `isBedsideTablet`. August 2025 omits them entirely,
 * so they ride on the epicVersion knob rather than living in the shape
 * templates.
 */
function withModernResultFields(payload: unknown): unknown {
  if (isLegacyEpicVersion()) return payload;
  const trio = { canGenerateLLMSummary: false, feedbackSubmitted: false, isBedsideTablet: false };
  const p = payload as Record<string, unknown>;
  if (Array.isArray(p?.results)) {
    p.results = p.results.map((r: Record<string, unknown>) => ({ ...trio, ...r }));
  }
  if (p?.newResults && typeof p.newResults === 'object') {
    for (const [k, v] of Object.entries(p.newResults as Record<string, unknown>)) {
      (p.newResults as Record<string, unknown>)[k] = { ...trio, ...(v as Record<string, unknown>) };
    }
  }
  return p;
}

export const labsGet: ExactRoutes = {
  'testresults': () => html(testResultsPage()),
};

export const labsPost: ExactRoutes = {
  // Real instances (all three captured) accept only groupType 0 and 1, and
  // both return ONE combined list holding every result kind — labs, imaging
  // and procedures together. Any other groupType is a 500 with the classic
  // ASP.NET Web API `{"Message": "An error has occurred."}` body. There is no
  // imaging-only groupType; the old fake invented one.
  'api/test-results/getlist': async ({ request, ds }) => {
    let groupType: unknown = 0;
    try {
      groupType = (await request.json()).groupType;
    } catch { /* treat as default */ }
    if (groupType !== 0 && groupType !== 1) {
      return json({ Message: 'An error has occurred.' }, 500);
    }
    const combined = {
      ...ds.labResultsList,
      newResultGroups: [
        ...ds.labResultsList.newResultGroups,
        ...ds.imagingLabResultsList.newResultGroups,
      ],
      newResults: {
        ...ds.labResultsList.newResults,
        ...ds.imagingLabResultsList.newResults,
      },
      newProviderPhotoInfo: {
        ...ds.labResultsList.newProviderPhotoInfo,
        ...ds.imagingLabResultsList.newProviderPhotoInfo,
      },
    };
    return json(withModernResultFields(conformToShape(shapes.testResultList, combined)));
  },

  'api/test-results/getdetails': async ({ request, ds }) => {
    let orderKey = '';
    try {
      orderKey = (await request.json()).orderKey ?? '';
    } catch { /* fall through to the empty shell */ }
    const byKey: Record<string, unknown> = {
      'GRP-XRAY': ds.imagingLabResultDetails,
      'GRP-CT': ds.ctLabResultDetails,
      'GRP-CMP': ds.cmpLabResultsDetails,
      'GRP-LIPID': ds.labResultsDetails,
      'GRP-CBC': ds.cbcLabResultsDetails,
    };
    // Real instances answer an unknown orderKey with a 200 whose envelope is
    // fully formed but EMPTY — blank orderName/key, one result with no name,
    // no components — never an error and never someone else's order.
    const fixture = byKey[orderKey] ?? { orderName: '', key: '', results: [{}] };
    return json(withModernResultFields(conformToShape(shapes.testResultDetails, fixture)));
  },

  'api/past-results/getmultiplehistoricalresultcomponents': async ({ request, ds }) => {
    // Real shape: historicalResults is a MAP keyed by component id (plus the
    // component ordering and report id), not a list.
    let orderID = '';
    try {
      orderID = (await request.json()).orderID ?? '';
    } catch { /* fall through */ }
    const data = ds.historicalResultsByOrder[orderID]
      ?? { historicalResults: {}, orderedComponentIDs: [], reportID: '', shouldShowBedsideActiveView: false };
    return json(conformToShape(shapes.getMultipleHistoricalResultComponents, data));
  },
};
