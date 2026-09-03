# `labs` — what each mode carries

Part of the processor layer. The rules (never rename a MyChart field, membership by field
name, markup only in `raw`, never invent a shape) and the drop-reason tags used in the
Reasoning column are in [`docs/processor-layer-proposal.md`](../../../../docs/processor-layer-proposal.md);
example output in all four modes is in
[`docs/processor-layer-examples.md`](../../../../docs/processor-layer-examples.md).

Columns: **Field** (MyChart's name, or the derived name), **What it is**,
**Derived** (✓ when the processor computes it from other fields; such a field
is never in `raw`), **Standard / JSON**, **Concise**, **Reasoning** (why the
field is in or out of each of the two).

Fields that share a description and a fate are grouped on one row. A group's
members are all listed so nothing is implied.

## `get_lab_results`

For each `groupType` in 0..3, `POST /api/test-results/GetList` (one combined
list for 0 and 1; a 500 for the rest, faithfully). Then per unique order key:
`POST /api/test-results/GetDetails`,
`POST /api/past-results/GetMultipleHistoricalResultComponents`, and, when
`reportDetails.reportID` is set, `POST /api/report-content/LoadReportContent`.
`raw` is the envelope. Joining the trend and report onto the order, and deleting
the abnormal flag, become processor work.

The `GetDetails` body, per order:

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `orderName` | Order (panel) name | — | ✓ | ✓ | What was ordered. |
| `key` | Order id | — | ✓ | — | Identifier; detail. |
| `results[].name` | Result name | — | ✓ | ✓ | What the result is; usually the panel name again. |
| `results[].key` | Result id | — | ✓ | — | Identifier. |
| `results[].isAbnormal` | Order-level abnormal flag | — | ✓ | — | A real MyChart field some instance may set, but `false` on all 39 captured results including out-of-range ones (#375). Standard keeps it as data; concise leaves it out so a reader does not take a never-set flag for a verdict. |
| `results[].hasComment`, `.warningType`, `.warningMessage` | Comment presence and warnings | — | ✓ | — | A warning is information; detail. |
| `results[].orderMetadata.prioritizedInstantISO` | Result timestamp | — | ✓ | ✓ | When. |
| `results[].orderMetadata.prioritizedInstantDisplay`, `.resultTimestampDisplay`, `.latestUpdateInstantISO` | Other renderings and the last-update time | — | ✓ | — | Kept for consumers that want MyChart's display form; concise shows one date. |
| `results[].orderMetadata.collectionTimestampsDisplay`, `.specimensDisplay` | Collection time and specimen | — | ✓ | — | Detail. |
| `results[].orderMetadata.resultStatus` | "Final", "Preliminary", … | — | ✓ | ✓ | A preliminary result may change; a reader must know. |
| `results[].orderMetadata.orderProviderName` | Ordering provider | — | ✓ | ✓ | Who. |
| `results[].orderMetadata.authorizingProviderName`, `.readingProviderName` | Other providers | — | ✓ | — | Detail. |
| `results[].orderMetadata.resultType` | "LAB" / "IMAGING" | — | ✓ | — | Classification; detail. |
| `results[].orderMetadata.associatedDiagnoses[]` | Diagnoses on the order | — | ✓ | — | Why it was ordered; detail. |
| `results[].orderMetadata.resultingLab.name`, `.address[]`, `.phoneNumber`, `.labDirector`, `.cliaNumber`, `.accreditationType` | Performing lab | — | ✓ | — | Provenance; detail. |
| `results[].orderMetadata.read`, `.unreadCommentingProviderName` | Read state | — | — | — | UI flag. |
| `results[].resultComponents[].componentInfo.componentID` | Component id; key into the trend map | — | ✓ | — | Internal handle; standard keeps it so the trend join is checkable. |
| `…componentInfo.name`, `.commonName`, `.units` | Component name and units | — | ✓ | ✓ | The analyte and its units. |
| `…componentResultInfo.value` | The value as MyChart prints it; RTF when `isValueRtf` | — | — | — | Markup stays in `raw` (rule 9). |
| `valueText` | The value as plain text | ✓ | ✓ | ✓ | Derived from `value`. Today it is `value` itself: no RTF value has ever been captured, so there is nothing to strip against; an RTF value passes through until one is (TODO §1). |
| `…componentResultInfo.numericValue` | The value as a number | — | ✓ | — | For consumers that compute; concise shows the printed form. |
| `…componentResultInfo.isValueRtf` | `value` carried RTF | — | ✓ | — | Says whether `valueText` was converted. |
| `…componentResultInfo.referenceRange.formattedReferenceRange` | Range as printed | — | ✓ | ✓ | The only abnormality signal MyChart gives (#375); a value without its range is uninterpretable. |
| `…referenceRange.low`, `.high`, `.displayLow`, `.displayHigh`, `.lowerBoundExclusive`, `.upperBoundExclusive` | Range parts | — | ✓ | — | For consumers that compare; concise shows the printed form. |
| `…componentResultInfo.abnormalFlagCategoryValue` | Per-component abnormal flag | — | — | — | Always empty: the literal `"Unknown"` on 175 of 175 captured components across both releases, out-of-range ones included (#375). A flag-shaped field with no verdict in it is worse than none. |
| `…componentComments.contentAsString` | Comment text | — | ✓ | ✓ | Lab comments qualify the value ("hemolyzed"); they belong beside it. |
| `…componentComments.contentAsHtml`, `.isRTF`, `.hasContent` | Comment as HTML and its flags | — | — | — | Duplicate. |
| `results[].studyResult.narrative.contentAsString`, `.signingInstantTimestamp` | Findings (imaging, pathology) | — | ✓ | ✓ (text) | The report. |
| `results[].studyResult.impression.contentAsString`, `.signingInstantTimestamp` | Impression | — | ✓ | ✓ (text) | The conclusion of the report. |
| `results[].studyResult.addenda[].contentAsString`, `.signingInstantTimestamp` | Addenda | — | ✓ | ✓ (text) | An addendum can reverse a finding. |
| `results[].studyResult.transcriptions[]`, `.ecgDiagnosis[]`, `.hasStudyContent`, `.isFullResultText`, `.isCupidAddendum` | Other study content | — | ✓ | — | Uncaptured; passed through. |
| `results[].studyResult.combinedRTFNarrativeImpression.*` | Narrative + impression concatenated | — | — | — | Duplicate. |
| `*.contentAsHtml`, `*.isRTF`, `*.hasContent` on narrative, impression, addenda, resultNote, resultLetter | HTML copies and flags | — | — | — | Duplicate; `hasContent` is not trusted (#380 reads the string). |
| `results[].resultNote.contentAsString`, `.signingInstantTimestamp` | Provider's note to the patient | — | ✓ | ✓ (text) | The clinician's interpretation, written for the patient. |
| `results[].resultLetter.contentAsString`, `.signingInstantTimestamp` | Result letter | — | ✓ | ✓ (text) | Same standing as the note. |
| `results[].providerComments[].commentText`, `.providerName`, `.commentDate` | Threaded comments | — | ✓ | — | Detail. |
| `results[].reportDetails.reportID`, `.isDownloadablePDFReport` | Report id and PDF availability | — | ✓ | — | Detail. |
| `results[].reportDetails.reportVars.ordId`, `.ordDat`, `.reportContext`, `.openRemotely` | Fetch variables | — | — | — | Internal. |
| `reportContent` (joined `LoadReportContent.reportContent`) | Rendered report HTML | — | — | — | Markup stays in `raw` (rule 9). |
| `reportContentText` | Plain text of the report | ✓ | ✓ | ✓ | Derived. The rendered report often carries what the structured fields do not (pathology, microbiology). |
| `LoadReportContent.reportCss`, `.baseFontSize`, `.stylesheets[]` | Styling | — | — | — | Asset. |
| `results[].imageStudies[]`, `.scans[]`, `.fdiLink.redirectUrl` | Imaging links | — | ✓ | — | Passed through for `get_imaging_results`; detail here. |
| `results[].indicators[]`, `.variants[]`, `.tooManyVariants`, `.geneticProfileLink` | Genetic-result fields | — | — | — | Uncaptured and empty on every capture; revisit when a genetic result is captured. |
| `results[].showName`, `.showDetails`, `.shouldHideHistoricalData`, `.shareEverywhereLogin`, `.showProviderNotReviewed`, `.hasAllDetails` | Rendering | — | — | — | UI flag. |
| `results[].baseSingleMessageUrl`, `.fullMultipleMessagesUrl`, `.relatedConversationIds[]`, `.hiddenProxies` | Messaging links | — | — | — | Portal link / internal. |
| `results[].canGenerateLLMSummary`, `.feedbackSubmitted`, `.isBedsideTablet` | November 2025 only | — | — | — | Release-only. |
| `orderLimitReached`, `ordersDeduplicated`, `isEnhancedAskAQuestionActive`, `hideEncInfo` | Page config | — | — | — | UI flag. |

The trend body, joined onto the order as `historicalResults`:

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `historicalResults[<componentID>].name`, `.commonName`, `.units` | Component | — | ✓ | — | Duplicate of the component's, kept because the map can hold components the current order lacks. |
| `historicalResults[<componentID>].oldestResultISO` | Start of the trend | — | ✓ | — | Says how far back the history goes; detail. |
| `historicalResults[<componentID>].historicalResultData[].dateISO`, `.value` | Trend points | — | ✓ | ✓ (8 most recent) | The trend is why a reader looks at a lab. Sorted before capping so the cap keeps the newest whatever order the instance sent (#380). |
| `…historicalResultData[].numericValue` | Trend value as a number | — | ✓ | — | For consumers that compute. |
| `…historicalResultData[].referenceRange.*`, `.isValueRtf` | Range at the time | — | ✓ (`formattedReferenceRange` and parts) | — | Ranges change over years; detail. |
| `…historicalResultData[].abnormalFlagCategoryValue` | Same `"Unknown"` | — | — | — | Always empty (#375). |
| `historicalResults[<componentID>].hideGraph`, `.showAbnormalFlag` | Per-graph display bits | — | — | — | UI flag. `showAbnormalFlag` is a display bit, not a per-value verdict (#375). |
| `orderedComponentIDs[]`, `reportID`, `shouldShowBedsideActiveView` | Ordering and plumbing | — | — | — | Internal / UI flag. |

The `GetList` body:

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `newResultGroups[].isInpatient`, `.isEDVisit`, `.formattedAdmitDate`, `.formattedDischargeDate` | Encounter context of the order; lifted onto the order | — | ✓ | — | Where the sample was drawn; detail. |
| `newResultGroups[].key`, `.contactType`, `.resultList[]`, `.isCurrentAdmission`, `.visitProviderID`, `.organizationID`, `.sortDate`, `.admitInstant`, `.dischargeInstant`, `.formattedDate`, `.isLargeGroup` | Grouping for the list page | — | — | — | Internal / duplicate of `GetDetails`. |
| `newResults{}`, `newProviderPhotoInfo{}`, `newComments{}`, `organizationLoadMoreInfo{}`, `areResultsFullyLoaded`, `isGroupingFullyLoaded`, `groupBy` | List-page copies of the detail data | — | — | — | Duplicate / asset / internal. |

**On abnormality.** Neither mode derives an abnormal verdict from the reference
range. `value`, `numericValue` and the range pass through, and that judgement is
the client's (the Expo alert code makes it, on its own).

---

## `get_imaging_results`

The same requests as labs, filtered to imaging orders, plus per imaging result
with an FDI context a `POST` to the FdiData endpoint for the SAML URL. The
filter, the narrative lifting and the `image_id` encoding are processor work.
The table lists only what imaging adds to the lab table.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `image_id` | Base64url of `{ fdi, ord }` | ✓ | ✓ | ✓ | Derived handle: what `download_imaging_study` takes. From the report HTML's `data-fdi-context` or from `fdiLink.redirectUrl`. |
| `index` | Position in the list | ✓ | ✓ | ✓ | Derived handle: the fallback when a model garbles the opaque token. |
| `hasViewableImages` | `image_id` could be extracted | ✓ | ✓ | ✓ | Derived. The difference between a report you can read and pictures you can look at, said explicitly. |
| `isImagingByName`, `isImagingByContent` | Why the order was classified as imaging | ✓ | ✓ | — | Derived. The classifier is a keyword heuristic; this is its audit trail. |
| `results[].imageStudies[].studyDescription`, `.modality`, `.studyDate`, `.numberOfImages` | Series | — | ✓ | ✓ | What the study contains. |
| `results[].imageStudies[].studyId`, `.viewerUrl`; `results[].scans[].scanId`, `.viewerUrl` | Viewer plumbing | — | — | — | Portal link / internal. |
| `results[].scans[].scanType`, `.scanDate` | Scan metadata | — | ✓ | — | Detail. |
| FdiData response (`samlUrl`), `viewerUrl` | Single-use viewer entry, expires in a minute or two | — | — | — | Acts like a credential and is dead by the time anyone reads it. Raw only. |
| `data-fdi-context`, `data-copy-context` attributes in the report HTML | The fdi/ord pair and Epic's internal order ids | — | — | — | Encoded into `image_id`; the rest is internal. |

Today's scraper adds `reportText`, `narrative`, `impression`, `resultDate`,
`orderProvider` as top-level copies; those are duplicates of the lab fields and
are not carried over.

---

## `download_imaging_study`

Media, not JSON: the four modes do not apply. Unchanged.
