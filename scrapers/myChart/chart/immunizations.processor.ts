/**
 * Immunizations processor. Field decisions: docs/processor-layer-proposal.md, `get_immunizations`.
 *
 * The per-organization nesting is flattened; the organization survives as
 * `organizationName` on each row (the rest of the organization object is the
 * org blob, dropped).
 */

import { bodyOf, type RawResponse } from '../core/rawResponse';
import type { Processor } from '../processors/processor';
import { list, rec, strings, textOrNull } from '../processors/read';

export interface ImmunizationStandard {
  name: string | null;
  formattedAdministeredDates: string[];
  id: string | null;
  /** Derived: `organization.organizationName` of the enclosing group. */
  organizationName: string | null;
}

export interface ImmunizationsStandard {
  immunizations: ImmunizationStandard[];
}

export const immunizationsProcessor: Processor<ImmunizationsStandard> = {
  standard(raw: RawResponse): ImmunizationsStandard {
    const body = rec(bodyOf(raw, 'LoadImmunizations'));
    const immunizations: ImmunizationStandard[] = [];
    for (const group of list(body.organizationImmunizationList)) {
      const g = rec(group);
      const organizationName = textOrNull(rec(g.organization).organizationName);
      for (const imm of list(g.orgImmunizations)) {
        const i = rec(imm);
        immunizations.push({
          name: textOrNull(i.name),
          formattedAdministeredDates: strings(i.formattedAdministeredDates),
          id: textOrNull(i.id),
          organizationName,
        });
      }
    }
    return { immunizations };
  },
  concise(standard) {
    return {
      immunizations: standard.immunizations.map((i) => ({
        name: i.name,
        formattedAdministeredDates: i.formattedAdministeredDates,
      })),
    };
  },
};
