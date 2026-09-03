/**
 * Health issues processor. Field decisions: docs/processor-layer-proposal.md, `get_health_issues`.
 */

import { bodyOf, type RawResponse } from '../../core/rawResponse';
import type { Processor } from '../../processors/processor';
import { boolOrNull, list, rec, textOrNull } from '../../processors/read';

export interface HealthIssueStandard {
  healthIssueItem: {
    name: string | null;
    formattedDateNoted: string | null;
    id: string | null;
    isReadOnly: boolean | null;
  };
  /** Other organizations' versions of the same problem (shape uncaptured). */
  externalItems: unknown[];
  externalOrgs: unknown[];
  hasLocalInstance: boolean | null;
}

export interface HealthIssuesStandard {
  dataList: HealthIssueStandard[];
}

export const healthIssuesProcessor: Processor<HealthIssuesStandard> = {
  standard(raw: RawResponse): HealthIssuesStandard {
    const body = rec(bodyOf(raw, 'LoadHealthIssuesData'));
    return {
      dataList: list(body.dataList).map((entry) => {
        const e = rec(entry);
        const item = rec(e.healthIssueItem);
        return {
          healthIssueItem: {
            name: textOrNull(item.name),
            formattedDateNoted: textOrNull(item.formattedDateNoted),
            id: textOrNull(item.id),
            isReadOnly: boolOrNull(item.isReadOnly),
          },
          externalItems: list(e.externalItems),
          externalOrgs: list(e.externalOrgs),
          hasLocalInstance: boolOrNull(e.hasLocalInstance),
        };
      }),
    };
  },
  concise(standard) {
    return {
      dataList: standard.dataList.map((d) => ({
        name: d.healthIssueItem.name,
        formattedDateNoted: d.healthIssueItem.formattedDateNoted,
      })),
    };
  },
};
