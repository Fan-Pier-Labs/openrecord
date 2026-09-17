/**
 * Raw MyChart responses for the `questionnaires` scraper.
 *
 * Observed by the capture harness behind `fake-mychart/src/data/realShapes.ts`
 * on three real instances — what we have seen, never a contract Epic owes us.
 *
 * `unknown` means the field was `null` on every instance captured: we saw no
 * value, so we know no type. `unknown[]` means the array was always empty, so
 * we have never seen an element. Neither is `null` or `never[]`, which would
 * read as settled.
 *
 * Read a payload with `rec<T>()` from `processors/read.ts` — it checks the
 * field names and leaves every value to `text()` / `num()` / `list()`. Never
 * `as`: that checks the same names and then lies about the values.
 *
 * Endpoints: /api/questionnaire/getquestionnairelist
 *
 * Keep in step with the captures; `scrapers/myChart/__tests__/wireShapes.unit.test.ts`
 * fails the build if these miss a field or invent one.
 */

/** Repeated shape. Appears in: chart/questionnaires. */
export type ExtraContextInfo = {
  ltkID: string;
  ltkInstant: string;
  larID: string;
  cjnID: string;
  isPreadmission: boolean;
  rshID: string;
};

/** Repeated shape. Appears in: chart/questionnaires. */
export type Questionnaire = {
  type: number;
  filterType: string;
  isContextSpecific: boolean;
  preText: string;
  postText: string;
  isPreTextSmartText: boolean;
  isPostTextSmartText: boolean;
  status: number;
  rootName: string;
  id: string;
  name: string;
};

/** Repeated shape. Appears in: chart/questionnaires. */
export type AssignedQuestionnaire = {
  dueDateISO: string;
  apptDateISO: string;
  isHistory: boolean;
  seriesData: {
    seriesName: string;
    pastResponses: Array<{
      filedDateISO: string;
      filedTimeISO: string;
      timeSinceFiled: number;
      filedDateFormatted: string;
      filedTimeFormatted: string;
      rootHqaID: string;
      answeringUser: string;
      viewingPastResponsesNotAllowed: boolean;
    }>;
    isSeriesForSurgery: boolean;
    surgeryData: {
      provider: string;
      procedureName: string;
      procedureDateISO: string;
      laterality: string;
    };
    assigningEncounterIdentifier: string;
    isSeriesForToDo: boolean;
  };
  hxData: {
    hxContext: string;
    hxContextID: string;
  };
  displayNameOverride: string;
  isTravelScreening: boolean;
  isProxyAccessing: boolean;
  context: {
    contextType: number;
    contextIdentifier: string;
    extraContextInfo: {
      ltkID: string;
      ltkInstant: string;
      larID: string;
      cjnID: string;
      isPreadmission: boolean;
      rshID: string;
    };
  };
  questionnaire: {
    type: number;
    filterType: string;
    isContextSpecific: boolean;
    preText: string;
    postText: string;
    isPreTextSmartText: boolean;
    isPostTextSmartText: boolean;
    status: number;
    rootName: string;
    id: string;
    name: string;
  };
};

/** Repeated shape. Appears in: chart/questionnaires. */
export type PastResponse = {
  filedDateISO: string;
  filedTimeISO: string;
  timeSinceFiled: number;
  filedDateFormatted: string;
  filedTimeFormatted: string;
  rootHqaID: string;
  answeringUser: string;
  viewingPastResponsesNotAllowed: boolean;
};

/** Repeated shape. Appears in: chart/questionnaires. */
export type SeriesData = {
  seriesName: string;
  pastResponses: Array<{
    filedDateISO: string;
    filedTimeISO: string;
    timeSinceFiled: number;
    filedDateFormatted: string;
    filedTimeFormatted: string;
    rootHqaID: string;
    answeringUser: string;
    viewingPastResponsesNotAllowed: boolean;
  }>;
  isSeriesForSurgery: boolean;
  surgeryData: {
    provider: string;
    procedureName: string;
    procedureDateISO: string;
    laterality: string;
  };
  assigningEncounterIdentifier: string;
  isSeriesForToDo: boolean;
};

/** Repeated shape. Appears in: chart/questionnaires. */
export type Context = {
  contextType: number;
  contextIdentifier: string;
  extraContextInfo: {
    ltkID: string;
    ltkInstant: string;
    larID: string;
    cjnID: string;
    isPreadmission: boolean;
    rshID: string;
  };
};

/** `/api/questionnaire/getquestionnairelist` */
export type GetQuestionnaireList = {
  assignedQuestionnaires: AssignedQuestionnaire[];
  optionalQuestionnaires: Array<{
    description: string;
    disablePastResponse: boolean;
    context: {
      contextType: number;
      contextIdentifier: string;
      extraContextInfo: {
        ltkID: string;
        ltkInstant: string;
        larID: string;
        cjnID: string;
        isPreadmission: boolean;
        rshID: string;
        from: string;
      };
    };
    questionnaire: {
      type: number;
      isContextSpecific: boolean;
      preText: string;
      postText: string;
      isPreTextSmartText: boolean;
      isPostTextSmartText: boolean;
      status: number;
      rootName: string;
      id: string;
      name: string;
    };
  }>;
  questionnaireContextLists: Array<{
    listContext: Context;
    assignedQuestionnaires: AssignedQuestionnaire[];
    index: number;
  }>;
  completedQuestionnaires: unknown[];
  showSeriesText: boolean;
  showBackButton: boolean;
  callingApp: number;
  showPretext: boolean;
  messageQnrExpired: boolean;
  sourceActivity: number;
};
