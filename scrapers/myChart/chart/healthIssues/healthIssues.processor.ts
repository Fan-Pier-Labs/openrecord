/**
 * Health issues processor. Field decisions: docs/processor-layer-proposal.md, `get_health_issues`.
 */

import { bodyOf, type RawResponse } from '../../core/rawResponse';
import type { Processor } from '../../processors/processor';
import { boolOrNull, list, rec, textOrNull } from '../../processors/read';
import type { LoadHealthIssuesData } from './mychart.types';
import type { HealthIssuesStandard } from './standardized.types';

export type { HealthIssueStandard, HealthIssuesStandard } from './standardized.types';

export const healthIssuesProcessor: Processor<HealthIssuesStandard> = {
  standard(raw: RawResponse): HealthIssuesStandard {
    const body = rec<LoadHealthIssuesData>(bodyOf(raw, 'LoadHealthIssuesData'));
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
