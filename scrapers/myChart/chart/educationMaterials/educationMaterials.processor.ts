/**
 * Education materials processor. Field decisions: docs/processor-layer-proposal.md,
 * `get_education_materials`.
 *
 * `GetPatEducationTitles` is a bare ARRAY of titles, so the standard object is
 * the list itself. Gamification (`numPoints`), thumbnails and the bedside-TV
 * flags are asset / UI / session context.
 */

import { bodyOf, type RawResponse } from '../../core/rawResponse';
import type { Processor } from '../../processors/processor';
import { boolOrNull, list, num, rec, textOrNull } from '../../processors/read';

export interface EducationMaterialStandard {
  displayName: string | null;
  assignedDate: string | null;
  elementId: string | null;
  eduKey: string | null;
  numTopics: number | null;
  wasAssignedThisVisit: boolean | null;
  numPagesReviewed: number | null;
  numPagesUnderstood: number | null;
  numPagesQuestions: number | null;
}

export type EducationMaterialsStandard = EducationMaterialStandard[];

export const educationMaterialsProcessor: Processor<EducationMaterialsStandard> = {
  standard(raw: RawResponse): EducationMaterialsStandard {
    return list(bodyOf(raw, 'GetPatEducationTitles')).map((value) => {
      const m = rec(value);
      return {
        displayName: textOrNull(m.displayName),
        assignedDate: textOrNull(m.assignedDate),
        elementId: textOrNull(m.elementId),
        eduKey: textOrNull(m.eduKey),
        numTopics: num(m.numTopics),
        wasAssignedThisVisit: boolOrNull(m.wasAssignedThisVisit),
        numPagesReviewed: num(m.numPagesReviewed),
        numPagesUnderstood: num(m.numPagesUnderstood),
        numPagesQuestions: num(m.numPagesQuestions),
      };
    });
  },
  concise(standard) {
    return standard.map((m) => ({ displayName: m.displayName, assignedDate: m.assignedDate }));
  },
};
