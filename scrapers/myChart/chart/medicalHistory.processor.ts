/**
 * Medical history processor. Field decisions: docs/processor-layer-proposal.md, `get_medical_history`.
 *
 * The scraper used to drop the whole `socialHistory` block (smoking, alcohol);
 * it is one of the first things any history asks, so it is here in both modes.
 */

import { bodyOf, type RawResponse } from '../core/rawResponse';
import type { Processor } from '../processors/processor';
import { list, rec, strings, textOrNull } from '../processors/read';

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

export const medicalHistoryProcessor: Processor<MedicalHistoryStandard> = {
  standard(raw: RawResponse): MedicalHistoryStandard {
    const body = rec(bodyOf(raw, 'LoadHistoriesViewModel'));
    const medical = rec(body.medicalHistory);
    const surgical = rec(body.surgicalHistory);
    const family = rec(body.familyHistoryAndStatus);
    const social = rec(body.socialHistory);
    const smoking = rec(social.smokingHistory);
    const smokeless = rec(social.smokelessHistory);
    const alcohol = rec(social.alcoholHistory);
    return {
      medicalHistory: {
        diagnoses: list(medical.diagnoses).map((d) => ({
          diagnosisName: textOrNull(rec(d).diagnosisName),
          diagnosisDate: textOrNull(rec(d).diagnosisDate),
        })),
        medicalHistoryNotes: textOrNull(medical.medicalHistoryNotes),
      },
      surgicalHistory: {
        surgeries: list(surgical.surgeries).map((s) => ({
          surgeryName: textOrNull(rec(s).surgeryName),
          surgeryDate: textOrNull(rec(s).surgeryDate),
        })),
        surgicalHistoryNotes: textOrNull(surgical.surgicalHistoryNotes),
      },
      familyHistoryAndStatus: {
        familyMembers: list(family.familyMembers).map((m) => {
          const member = rec(m);
          return {
            relationshipToPatientName: textOrNull(member.relationshipToPatientName),
            conditions: strings(member.conditions),
            statusName: textOrNull(member.statusName),
            nameOrAlias: textOrNull(member.nameOrAlias),
            sexName: textOrNull(member.sexName),
            relativeAge: textOrNull(member.relativeAge),
            relativeAgeEnd: textOrNull(member.relativeAgeEnd),
          };
        }),
        familyHistoryNotes: textOrNull(family.familyHistoryNotes),
        familyStatusNotes: textOrNull(family.familyStatusNotes),
      },
      socialHistory: {
        smokingHistory: {
          smokingTobaccoStatus: textOrNull(smoking.smokingTobaccoStatus),
          tobaccoUse: textOrNull(smoking.tobaccoUse),
          smokingTobaccoTypes: strings(smoking.smokingTobaccoTypes),
          smokingTobaccoQuitDate: textOrNull(smoking.smokingTobaccoQuitDate),
        },
        smokelessHistory: {
          smokelessTobaccoStatus: textOrNull(smokeless.smokelessTobaccoStatus),
          smokelessTobaccoTypes: strings(smokeless.smokelessTobaccoTypes),
          smokelessQuitDate: textOrNull(smokeless.smokelessQuitDate),
        },
        alcoholHistory: {
          alcoholUse: textOrNull(alcohol.alcoholUse),
          alcoholAmount: textOrNull(alcohol.alcoholAmount),
          alcoholUnit: textOrNull(alcohol.alcoholUnit),
        },
        socialHistoryNotes: textOrNull(social.socialHistoryNotes),
      },
    };
  },
  concise(standard) {
    return {
      diagnoses: standard.medicalHistory.diagnoses,
      surgeries: standard.surgicalHistory.surgeries,
      familyMembers: standard.familyHistoryAndStatus.familyMembers.map((m) => ({
        relationshipToPatientName: m.relationshipToPatientName,
        statusName: m.statusName,
        conditions: m.conditions,
      })),
      smokingTobaccoStatus: standard.socialHistory.smokingHistory.smokingTobaccoStatus,
      tobaccoUse: standard.socialHistory.smokingHistory.tobaccoUse,
      alcoholUse: standard.socialHistory.alcoholHistory.alcoholUse,
    };
  },
};
