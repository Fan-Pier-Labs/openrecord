/**
 * What the `labs` capabilities return: the standard objects the processors
 * build from MyChart's responses. MyChart's own shapes are in
 * `./mychart.types.ts`.
 */

export interface ImagingOrderStandard extends LabOrderStandard {
  /** Derived handle: position in this list, the fallback when a model garbles `image_id`. */
  index: number;
  /** Derived handle: base64url of `{ fdi, ord }`; what `download_imaging_study` takes. */
  image_id: string | null;
  /** Derived: an `image_id` could be extracted — pictures, not just a report. */
  hasViewableImages: boolean;
  /** Derived: the order name matched an imaging keyword. */
  isImagingByName: boolean;
  /** Derived: a result carried imaging-shaped content. */
  isImagingByContent: boolean;
}

export interface ImagingResultsStandard {
  orders: ImagingOrderStandard[];
}

export interface ImagingOrderConcise extends LabOrderConcise {
  index: number;
  image_id: string | null;
  hasViewableImages: boolean;
  results: Array<LabOrderConcise['results'][number] & { imageStudies: ImageStudyStandard[] }>;
}

export interface ReferenceRangeStandard {
  formattedReferenceRange: string | null;
  low: number | null;
  high: number | null;
  displayLow: string | null;
  displayHigh: string | null;
  lowerBoundExclusive: boolean | null;
  upperBoundExclusive: boolean | null;
}

export interface LabComponentStandard {
  componentInfo: {
    /** Key into `historicalResults`. */
    componentID: string | null;
    name: string | null;
    commonName: string | null;
    units: string | null;
  };
  componentResultInfo: {
    /**
     * Derived: the value as plain text. Today this is `value` itself — no RTF
     * value has ever been captured (`isValueRtf` exists only in the skeleton),
     * so there is nothing to convert against. TODO(docs/processor-layer-todo.md
     * §1): when a capture shows what MyChart's RTF looks like, strip it here
     * with a real converter; until then an RTF value passes through as-is.
     */
    valueText: string | null;
    numericValue: number | null;
    isValueRtf: boolean | null;
    referenceRange: ReferenceRangeStandard;
  };
  componentComments: { contentAsString: string | null };
}

/** A signed block of text: narrative, impression, addendum, note, letter. */
export interface SignedTextStandard {
  contentAsString: string | null;
  signingInstantTimestamp: string | null;
}

export interface StudyResultStandard {
  narrative: SignedTextStandard;
  impression: SignedTextStandard;
  addenda: SignedTextStandard[];
  /** Uncaptured; passed through whole. */
  transcriptions: unknown[];
  /** Uncaptured; passed through whole. */
  ecgDiagnosis: unknown[];
  hasStudyContent: boolean | null;
  isFullResultText: boolean | null;
  isCupidAddendum: boolean | null;
}

export interface ResultingLabStandard {
  name: string | null;
  address: string[];
  phoneNumber: string | null;
  labDirector: string | null;
  cliaNumber: string | null;
  accreditationType: string | null;
}

export interface OrderMetadataStandard {
  prioritizedInstantISO: string | null;
  prioritizedInstantDisplay: string | null;
  resultTimestampDisplay: string | null;
  latestUpdateInstantISO: string | null;
  collectionTimestampsDisplay: string | null;
  specimensDisplay: string | null;
  resultStatus: string | null;
  orderProviderName: string | null;
  authorizingProviderName: string | null;
  readingProviderName: string | null;
  resultType: string | number | null;
  associatedDiagnoses: string[];
  resultingLab: ResultingLabStandard;
}

export interface ProviderCommentStandard {
  commentText: string | null;
  providerName: string | null;
  commentDate: string | null;
}

export interface ImageStudyStandard {
  studyDescription: string | null;
  modality: string | null;
  studyDate: string | null;
  numberOfImages: number | null;
}

export interface ScanStandard {
  scanType: string | null;
  scanDate: string | null;
}

export interface LabResultStandard {
  name: string | null;
  key: string | null;
  isAbnormal: boolean | null;
  hasComment: boolean | null;
  warningType: string | null;
  warningMessage: string | null;
  orderMetadata: OrderMetadataStandard;
  resultComponents: LabComponentStandard[];
  studyResult: StudyResultStandard;
  resultNote: SignedTextStandard;
  resultLetter: SignedTextStandard;
  providerComments: ProviderCommentStandard[];
  reportDetails: { reportID: string | null; isDownloadablePDFReport: boolean | null };
  /**
   * Derived: plain text of the joined `LoadReportContent.reportContent`.
   * `null` when the result named no report or none was fetched.
   */
  reportContentText: string | null;
  imageStudies: ImageStudyStandard[];
  scans: ScanStandard[];
  fdiLink: { redirectUrl: string | null };
}

export interface HistoricalPointStandard {
  dateISO: string | null;
  value: string | null;
  numericValue: number | null;
  isValueRtf: boolean | null;
  referenceRange: ReferenceRangeStandard;
}

export interface HistoricalComponentStandard {
  name: string | null;
  commonName: string | null;
  units: string | null;
  oldestResultISO: string | null;
  historicalResultData: HistoricalPointStandard[];
}

export interface LabOrderStandard {
  orderName: string | null;
  key: string | null;
  /** Lifted from the matching `GetList` group: the encounter the order belongs to. */
  isInpatient: boolean | null;
  isEDVisit: boolean | null;
  formattedAdmitDate: string | null;
  formattedDischargeDate: string | null;
  results: LabResultStandard[];
  /** The joined trend body, keyed by `componentID`. */
  historicalResults: Record<string, HistoricalComponentStandard>;
}

export interface LabResultsStandard {
  orders: LabOrderStandard[];
}

/** The concise projection of one order, shared with the imaging processor. */
export interface LabOrderConcise {
  orderName: string | null;
  results: Array<{
    name: string | null;
    prioritizedInstantISO: string | null;
    resultStatus: string | null;
    orderProviderName: string | null;
    resultComponents: Array<{
      name: string | null;
      commonName: string | null;
      units: string | null;
      valueText: string | null;
      formattedReferenceRange: string | null;
      contentAsString: string | null;
    }>;
    narrative: string | null;
    impression: string | null;
    addenda: Array<string | null>;
    resultNote: string | null;
    resultLetter: string | null;
    reportContentText: string | null;
  }>;
  historicalResults: Record<string, { name: string | null; historicalResultData: Array<{ dateISO: string | null; value: string | null }> }>;
}
