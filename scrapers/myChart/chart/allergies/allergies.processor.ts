/**
 * Allergies processor. Field decisions: docs/processor-layer-proposal.md, `get_allergies`.
 *
 * The captured account had no allergies, so the `dataList` element shape is
 * unverified and passed through whole (rule 10). An empty list is emitted in
 * every mode: "no allergies on file" is the answer most readers want.
 */

import { bodyOf, type RawResponse } from '../../core/rawResponse';
import type { Processor } from '../../processors/processor';
import { list, num, rec, textOrNull } from '../../processors/read';
import type { LoadAllergies } from './mychart.types';
import type { AllergiesStandard } from './standardized.types';

export type { AllergiesStandard } from './standardized.types';

export const allergiesProcessor: Processor<AllergiesStandard> = {
  standard(raw: RawResponse): AllergiesStandard {
    const body = rec<LoadAllergies>(bodyOf(raw, 'LoadAllergies'));
    return {
      dataList: list(body.dataList),
      allergiesStatus: num(body.allergiesStatus),
      dateOfBirth: textOrNull(body.dateOfBirth),
    };
  },
  concise(standard) {
    return { dataList: standard.dataList, allergiesStatus: standard.allergiesStatus };
  },
};
