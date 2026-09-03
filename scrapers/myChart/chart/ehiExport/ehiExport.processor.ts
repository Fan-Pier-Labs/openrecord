/**
 * EHI export processor. Field decisions: docs/processor-layer-proposal.md, `get_ehi_export`.
 *
 * `hideAdditionalComments` is form config; `__Status` and
 * `__UpdateableSettings` describe the server's own throttle and queue.
 */

import { bodyOf, type RawResponse } from '../../core/rawResponse';
import type { Processor } from '../../processors/processor';
import { boolOrNull, list, rec, textOrNull } from '../../processors/read';

export interface EhiTemplateStandard {
  name: string | null;
  description: string | null;
  /** Identifier a future export capability would take. */
  id: string | null;
}

export interface EhiExportStandard {
  existingEHIE: boolean | null;
  isNoBuildEhie: boolean | null;
  ehieTemplates: EhiTemplateStandard[];
}

export const ehiExportProcessor: Processor<EhiExportStandard> = {
  standard(raw: RawResponse): EhiExportStandard {
    const body = rec(bodyOf(raw, 'GetEHIETemplates'));
    return {
      existingEHIE: boolOrNull(body.existingEHIE),
      isNoBuildEhie: boolOrNull(body.isNoBuildEhie),
      ehieTemplates: list(body.ehieTemplates).map((value) => {
        const t = rec(value);
        return { name: textOrNull(t.name), description: textOrNull(t.description), id: textOrNull(t.id) };
      }),
    };
  },
  concise(standard) {
    return { ehieTemplates: standard.ehieTemplates.map((t) => ({ name: t.name, description: t.description })) };
  },
};
