import { makeAuthenticatedRequest, SessionExpiredError } from '../../core/makeAuthenticatedRequest';
import type { HistoricalResultsResponse, ImagingResult, LabTestResult, LabTestResultWithHistory, ReportContent, ReportDetails } from "./labtestresulttype";
import type { LabResultsList } from "./labtypes";
import type { MyChartRequest } from "../../core/myChartRequest";
import { getRequestVerificationTokenFromBody } from "../../core/util";
import { extractFdiContext, extractFdiContextFromFdiLink, getImageViewerSamlUrl, followSamlChain } from "../../eunity/imagingViewer";
import { logger } from '../../../../shared/logger';


async function getReportContent(mychartRequest: MyChartRequest, reportDetails: ReportDetails, requestVerificationToken: string): Promise<ReportContent> {
  const res = await makeAuthenticatedRequest(mychartRequest, {
    path: `/api/report-content/LoadReportContent`,
    "headers": {
      "Content-Type": "application/json; charset=utf-8",
      __requestverificationtoken: requestVerificationToken
    },
    "body": JSON.stringify({
      "reportID": reportDetails.reportID,
      "assumedVariables": {
        "ordId": reportDetails.reportVars.ordId,
        "ordDat": reportDetails.reportVars.ordDat
      },
      "isFullReportPage": false,
      "uniqueClass": "EID-4",
      "nonce": ""
    }),
    "method": "POST",
  });

  return res.json();
}

async function getRequestVerificationToken(mychartRequest: MyChartRequest) {

  // Go to the communication center
  const communicationCenterRes = await makeAuthenticatedRequest(mychartRequest, { path: '/app/test-results' })
  return getRequestVerificationTokenFromBody(await communicationCenterRes.text())
}


/**
 * MyChart's per-component `abnormalFlagCategoryValue` is junk on every
 * instance, and we drop it rather than pass it on.
 *
 * Captured Sep 2026 against two real instances (Epic's August 2025 and
 * November 2025 releases): the field was the literal string `"Unknown"` on all
 * 175 components, including the 13 whose value sat outside their own numeric
 * reference range. Nothing else in the payload carries a verdict either —
 * `componentResultInfo` has exactly five keys, every result's `isAbnormal` was
 * `false`, the historical `showAbnormalFlag` is a per-graph display bit rather
 * than a per-value flag, and the rendered report HTML contains no abnormality
 * markup. fake-mychart serves `"Unknown"` for the same reason: it is what real
 * MyChart sends (`realBehavior.integration.test.ts` pins that).
 *
 * A field that always reads `"Unknown"` is worse than no field — a client sees
 * a flag-shaped value and takes it for a verdict. We do NOT replace it with a
 * derived one: comparing the value against `referenceRange` is a judgement
 * MyChart never made, and inventing it here would put words in the chart's
 * mouth. `value`, `numericValue` and `referenceRange` are passed through
 * untouched, so a client that wants to make that comparison still can.
 */
function dropUnusableAbnormalFlag(info: Record<string, unknown> | undefined): void {
  if (info) delete info['abnormalFlagCategoryValue'];
}

function dropUnusableAbnormalFlags(test: LabTestResult): LabTestResult {
  for (const result of test.results ?? []) {
    for (const component of result?.resultComponents ?? []) {
      dropUnusableAbnormalFlag(component?.componentResultInfo as unknown as Record<string, unknown> | undefined);
    }
  }
  return test;
}

async function getLabResult(mychartRequest: MyChartRequest, key: string, requestVerificationToken: string): Promise<LabTestResult> {
  const res = await makeAuthenticatedRequest(mychartRequest, {
    path: `/api/test-results/GetDetails`,
    "headers": {
      "Content-Type": "application/json; charset=utf-8",
      __requestverificationtoken: requestVerificationToken
    },
    "body": JSON.stringify({ "orderKey": key, "organizationID": "", "PageNonce": "" }),
    "method": "POST",
  });

  const out = dropUnusableAbnormalFlags(await res.json() as LabTestResult);

  for (const result of out.results ?? []) {
    if (result?.reportDetails?.reportID) {

      const reportdata = await getReportContent(mychartRequest, result.reportDetails, requestVerificationToken)

      result.reportDetails.reportContent = reportdata;
    }
  }

  return out
}


async function getHistoricalResults(
  mychartRequest: MyChartRequest,
  orderKey: string,
  requestVerificationToken: string
): Promise<HistoricalResultsResponse | null> {
  try {
    const res = await makeAuthenticatedRequest(mychartRequest, {
      path: '/api/past-results/GetMultipleHistoricalResultComponents',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        __requestverificationtoken: requestVerificationToken,
      },
      body: JSON.stringify({
        orderID: orderKey,
        selectedComponentIDs: [],
        isInitialLoad: true,
        startTime: '',
        endTime: '',
        organizationID: '',
        isCustomFilterEnabled: false,
        PageNonce: '',
      }),
      method: 'POST',
    });

    if (!res.ok) return null;

    const history = await res.json() as HistoricalResultsResponse;
    // Same junk field, same treatment, on every point of every trend.
    for (const component of Object.values(history.historicalResults ?? {})) {
      for (const point of component?.historicalResultData ?? []) {
        dropUnusableAbnormalFlag(point as unknown as Record<string, unknown>);
      }
    }
    return history;
  } catch {
    return null;
  }
}

export async function listLabResults(mychartRequest: MyChartRequest): Promise<LabTestResultWithHistory[]> {

  const requestVerificationToken = await getRequestVerificationToken(mychartRequest)

  if (!requestVerificationToken) {
    logger.debug('could not find request verification token')
    return []
  }

  const allresults: LabTestResultWithHistory[] = []
  const seenKeys = new Set<string>();

  // Fetch all group types (0-3) to capture all test results including blood panels
  for (const groupType of [0, 1, 2, 3]) {
    const out = await fetchResultGroupList(mychartRequest, groupType, requestVerificationToken);
    if (!out) continue;

    // Outside the swallow: these are results the instance says exist, so a
    // failure here would return a short list indistinguishable from a
    // complete one — "you have 39 results" when you have 60.
    for (const newResultGroup of out.newResultGroups || []) {
      if (seenKeys.has(newResultGroup.key)) continue;
      seenKeys.add(newResultGroup.key);

      const labResult: LabTestResultWithHistory = await getLabResult(mychartRequest, newResultGroup.key, requestVerificationToken);
      logger.debug('got detail back:', labResult.orderName)

      // Fetch historical trend data for this order
      const history = await getHistoricalResults(mychartRequest, newResultGroup.key, requestVerificationToken);
      if (history) {
        labResult.historicalResults = history;
      }

      allresults.push(labResult)
    }
  }

  return allresults;
}

/**
 * One `/api/test-results/GetList` page, or null when this instance does not
 * serve that group type. Group types 0-3 are probed speculatively, so a
 * failure here is expected — which is why it is the ONLY failure swallowed on
 * this path. A `SessionExpiredError` still propagates: reporting a dead
 * session as "unsupported group type" turns it into an empty chart.
 */
async function fetchResultGroupList(
  mychartRequest: MyChartRequest,
  groupType: number,
  requestVerificationToken: string,
): Promise<LabResultsList | null> {
  try {
    const resp = await makeAuthenticatedRequest(mychartRequest, {
      path: '/api/test-results/GetList',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        '__RequestVerificationToken': requestVerificationToken,
      },
      body: JSON.stringify({ groupType, searchString: '', maxResults: 1000, isCurAdmFilterEnabled: false }),
      method: 'POST',
    });

    if (!resp.ok) return null;

    return await resp.json() as LabResultsList;
  } catch (err) {
    if (err instanceof SessionExpiredError) throw err;
    logger.debug(`test-results GetList failed for groupType ${groupType}:`, (err as Error).message);
    return null;
  }
}


export async function getImagingResults(mychartRequest: MyChartRequest, options?: { followSaml?: boolean }): Promise<ImagingResult[]> {
  const requestVerificationToken = await getRequestVerificationToken(mychartRequest);

  if (!requestVerificationToken) {
    logger.debug('could not find request verification token for imaging');
    return [];
  }

  // Try multiple group types - imaging may be in a different group
  const allResults: ImagingResult[] = [];
  const seenKeys = new Set<string>();

  for (const groupType of [0, 1, 2, 3]) {
    const out = await fetchResultGroupList(mychartRequest, groupType, requestVerificationToken);
    if (!out) continue;

    // Outside the swallow, as in listLabResults.
    for (const resultGroup of out.newResultGroups || []) {
      if (seenKeys.has(resultGroup.key)) continue;
      seenKeys.add(resultGroup.key);

      const labResult = await getLabResult(mychartRequest, resultGroup.key, requestVerificationToken);

      // Check if this result has imaging content (structured data or keyword match)
      const nameLower = labResult.orderName?.toLowerCase() ?? '';
      const isImagingByName =
        nameLower.includes('x-ray') || nameLower.includes('xray') || nameLower.includes('xr ') ||
        nameLower.includes('mri') || nameLower.includes('ct ') || nameLower.includes('ct,') ||
        nameLower.includes('imaging') || nameLower.includes('radiology') ||
        nameLower.includes('ultrasound') || nameLower.includes('fluoroscop') ||
        nameLower.includes('arthrogram') || nameLower.includes('mammogram') ||
        nameLower.includes('oct,') || nameLower.includes('oct ') ||
        nameLower.includes('pathology') || nameLower.includes('excision');
      const hasImagingData = labResult.results?.some(r =>
        (r.imageStudies && r.imageStudies.length > 0) ||
        (r.scans && r.scans.length > 0) ||
        r.studyResult?.narrative?.hasContent ||
        r.studyResult?.impression?.hasContent ||
        r.reportDetails?.reportID
      );
      const hasImaging = isImagingByName || hasImagingData;

      if (hasImaging) {
        const imagingResult: ImagingResult = { ...labResult };

        // Extract report text from narrative + impression
        const reportParts: string[] = [];
        const narrativeParts: string[] = [];
        const impressionParts: string[] = [];
        for (const r of labResult.results ?? []) {
          if (r.studyResult?.narrative?.hasContent) {
            reportParts.push(r.studyResult.narrative.contentAsString);
            narrativeParts.push(r.studyResult.narrative.contentAsString);
          }
          if (r.studyResult?.impression?.hasContent) {
            reportParts.push('IMPRESSION: ' + r.studyResult.impression.contentAsString);
            impressionParts.push(r.studyResult.impression.contentAsString);
          }
        }
        if (reportParts.length > 0) {
          imagingResult.reportText = reportParts.join('\n\n');
        }
        if (narrativeParts.length > 0) {
          imagingResult.narrative = narrativeParts.join('\n\n');
        }
        if (impressionParts.length > 0) {
          imagingResult.impression = impressionParts.join('\n\n');
        }

        // Extract provider and date from first result
        const firstResult = labResult.results?.[0];
        if (firstResult?.orderMetadata) {
          imagingResult.resultDate = firstResult.orderMetadata.resultTimestampDisplay || '';
          imagingResult.orderProvider = firstResult.orderMetadata.orderProviderName || '';
        }

        // Extract FDI context (for image viewer access) — from the report
        // content HTML, or from the structured fdiLink some instances (e.g.
        // Mass General Brigham) serve instead of a data-fdi-context attribute.
        for (const r of labResult.results ?? []) {
          const reportHtml = r.reportDetails?.reportContent?.reportContent;
          const fdi =
            (reportHtml ? extractFdiContext(reportHtml) : null) ??
            (r.fdiLink?.redirectUrl ? extractFdiContextFromFdiLink(r.fdiLink.redirectUrl) : null);
          if (fdi) {
            imagingResult.fdiContext = fdi;

            // Get the SAML URL for the image viewer
            try {
              const session = await getImageViewerSamlUrl(mychartRequest, fdi);
              if (session) {
                imagingResult.samlUrl = session.samlUrl;

                // Optionally follow the SAML chain to get the eUnity viewer URL
                if (options?.followSaml) {
                  const viewerSession = await followSamlChain(mychartRequest, session.samlUrl);
                  if (viewerSession) {
                    imagingResult.viewerUrl = viewerSession.viewerUrl;
                  }
                }
              }
            } catch (err) {
              logger.debug('Error getting viewer URL:', (err as Error).message);
            }

            break; // Only need FDI from one result
          }
        }

        allResults.push(imagingResult);
      }
    }
  }

  return allResults;
}
