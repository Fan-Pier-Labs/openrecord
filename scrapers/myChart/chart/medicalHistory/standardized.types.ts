/**
 * What the `medicalHistory` capabilities return: the standard objects the processors
 * build from MyChart's responses. MyChart's own shapes are in
 * `./mychart.types.ts`.
 */

export interface DiagnosisStandard {
  diagnosisName: string | null;
  diagnosisDate: string | null;
}

export interface SurgeryStandard {
  surgeryName: string | null;
  surgeryDate: string | null;
}

export interface FamilyMemberStandard {
  relationshipToPatientName: string | null;
  conditions: string[];
  statusName: string | null;
  nameOrAlias: string | null;
  sexName: string | null;
  relativeAge: string | null;
  relativeAgeEnd: string | null;
}

export interface MedicalHistoryStandard {
  medicalHistory: { diagnoses: DiagnosisStandard[]; medicalHistoryNotes: string | null };
  surgicalHistory: { surgeries: SurgeryStandard[]; surgicalHistoryNotes: string | null };
  familyHistoryAndStatus: {
    familyMembers: FamilyMemberStandard[];
    familyHistoryNotes: string | null;
    familyStatusNotes: string | null;
  };
  socialHistory: {
    smokingHistory: {
      smokingTobaccoStatus: string | null;
      tobaccoUse: string | null;
      smokingTobaccoTypes: string[];
      smokingTobaccoQuitDate: string | null;
    };
    smokelessHistory: {
      smokelessTobaccoStatus: string | null;
      smokelessTobaccoTypes: string[];
      smokelessQuitDate: string | null;
    };
    alcoholHistory: { alcoholUse: string | null; alcoholAmount: string | null; alcoholUnit: string | null };
    socialHistoryNotes: string | null;
  };
}
