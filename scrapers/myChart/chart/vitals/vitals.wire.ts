/**
 * Raw MyChart responses for the `vitals` scraper.
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
 * Endpoints: /api/track-my-health/getflowsheetreadings, /api/track-my-health/getflowsheets
 *
 * Keep in step with the captures; `scrapers/myChart/__tests__/wireShapes.unit.test.ts`
 * fails the build if these miss a field or invent one.
 */

/** Repeated shape. Appears in: chart/vitals. */
export type UserSetting = {
  isAdmitted: boolean;
  isH2GSession: boolean;
  isMOContext: boolean;
  isDataTileContext: boolean;
  isProxyContext: boolean;
  myChartPatientId: string;
  myChartPatientName: string;
  myChartUserId: string;
  myChartUserName: string;
  devicePlatform: string;
  healthConnectAvailable: string;
  moVersionSupportsBluetooth: boolean;
};

/** `/api/track-my-health/getflowsheetreadings` */
export type GetFlowsheetReadings = {
  flowsheet: {
    episodeId: string;
    templateId: string;
    name: string;
    entryType: string;
    entryMode: string;
    status: string;
    startDateIso: string;
    endDateIso: string;
    instructions: string;
    hasMoreData: boolean;
    hasEpisodeData: boolean;
    rowGroups: Array<{
      id: string;
      name: string;
      rowIds: string[];
    }>;
    rows: Array<{
      id: string;
      name: string;
      rowType: string;
      valueType: string;
      decimalPlaces: number;
    }>;
    readings: Array<{
      id: string;
      fsdId: string;
      rowId: string;
      valueType: string;
      entryType: string;
      instantTakenIso: string;
      isAbnormal: boolean;
      documentationSource: string;
      stringValue: string;
      dataType: string;
      line: number;
      decimalPlaces: number;
      timeZone: string;
      sourceRowId: string;
    }>;
  };
  userSettings: UserSetting;
};

/** `/api/track-my-health/getflowsheets` */
export type GetFlowsheets = {
  flowsheets: Array<{
    episodeId: string;
    templateId: string;
    name: string;
    entryType: string;
    entryMode: string;
    status: string;
    startDateIso: string;
    endDateIso: string;
    instructions: string;
    hasMoreData: boolean;
    hasEpisodeData: boolean;
    rowGroups: Array<{
      id: string;
      name: string;
      rowIds: string[];
    }>;
    rows: Array<{
      id: string;
      name: string;
      rowType: string;
      valueType: string;
      decimalPlaces: number;
    }>;
    readings: unknown[];
  }>;
  userSettings: UserSetting;
};
