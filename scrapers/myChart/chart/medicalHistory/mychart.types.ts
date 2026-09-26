/**
 * Raw MyChart responses for the `medicalHistory` scraper.
 *
 * Observed by the capture harness behind `fake-mychart/src/data/realShapes.ts`
 * on three real instances — what we have seen, never a contract Epic owes us.
 *
 * `unknown` means the field was `null` on every instance captured: we saw no
 * value, so we know no type. `unknown[]` means the array was always empty, so
 * we have never seen an element. Neither is `null` or `never[]`, which would
 * read as settled.
 *
 * Read a payload with `rec<T>()` from `../../processors/read.ts` — it checks the
 * field names and leaves every value to `text()` / `num()` / `list()`. Never
 * `as`: that checks the same names and then lies about the values.
 *
 * Endpoints: /api/histories/loadhistoriesviewmodel
 *
 * Keep in step with `realShapes.ts` when the captures are refreshed.
 */

/** `/api/histories/loadhistoriesviewmodel` */
export type LoadHistoriesViewModel = {
  surgicalHistory?: {
    surgeries?: Array<{
      surgeryName?: string;
      surgeryDate?: string;
    }>;
    surgicalHistoryNotes?: string;
  };
  medicalHistory?: {
    diagnoses?: Array<{
      diagnosisName?: string;
      diagnosisDate?: string;
    }>;
    medicalHistoryNotes?: string;
  };
  familyHistoryAndStatus?: {
    familyMembers?: Array<{
      nameOrAlias?: string;
      sexId?: string;
      sexName?: string;
      genderId?: string;
      relationshipToPatientId?: string;
      relationshipToPatientName?: string;
      statusId?: string;
      statusName?: string;
      relativeAge?: string;
      relativeAgeEnd?: string;
      familyMemberId?: string;
      removeFamilyMember?: boolean;
      createdOnClient?: boolean;
      conditions?: string[];
      changes?: unknown[];
    }>;
    familyHistoryNotes?: string;
    familyStatusNotes?: string;
  };
  socialHistory?: {
    smokingHistory?: {
      smokingTobaccoStatus?: string;
      smokingTobaccoTypes?: unknown[];
      tobaccoUse?: string;
      smokingTobaccoQuitDate?: string;
      showSmokingTobaccoQuitDate?: boolean;
    };
    smokelessHistory?: {
      smokelessTobaccoStatus?: string;
      smokelessTobaccoTypes?: unknown[];
      smokelessQuitDate?: string;
      showSmokelessTobaccoQuitDate?: boolean;
    };
    alcoholHistory?: {
      alcoholUse?: string;
      alcoholAmount?: string;
      alcoholUnit?: string;
    };
    socialHistoryNotes?: string;
    isProxy?: boolean;
  };
  isShareEverywhere?: boolean;
};
