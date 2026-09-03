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

export interface AllergiesStandard {
  /** One allergy per element, as MyChart sent it (shape uncaptured). */
  dataList: unknown[];
  /** Status code of the allergy list: reviewed vs unreviewed. */
  allergiesStatus: number | null;
  dateOfBirth: string | null;
}

export const allergiesProcessor: Processor<AllergiesStandard> = {
  standard(raw: RawResponse): AllergiesStandard {
    const body = rec(bodyOf(raw, 'LoadAllergies'));
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
