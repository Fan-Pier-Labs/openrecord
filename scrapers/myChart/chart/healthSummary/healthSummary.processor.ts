/**
 * Health summary processor. Field decisions: docs/processor-layer-proposal.md, `get_health_summary`.
 */

import { bodyOf, type RawResponse } from '../../core/rawResponse';
import type { Processor } from '../../processors/processor';
import { boolOrNull, list, rec, textOrNull } from '../../processors/read';
import type { FetchH2GHeader, FetchHealthSummary } from './mychart.types';
import type { HealthSummaryStandard, MeasurementStandard, VisitPointerStandard } from './standardized.types';

export type { HealthSummaryStandard, MeasurementStandard, VisitPointerStandard } from './standardized.types';

function measurement(value: unknown): MeasurementStandard {
  const m = rec(value);
  return { value: textOrNull(m.value), dateRecorded: textOrNull(m.dateRecorded) };
}

function visitPointer(value: unknown): VisitPointerStandard {
  const v = rec(value);
  return { date: textOrNull(v.date), visitType: textOrNull(v.visitType) };
}

export const healthSummaryProcessor: Processor<HealthSummaryStandard> = {
  standard(raw: RawResponse): HealthSummaryStandard {
    const summary = rec<FetchHealthSummary>(bodyOf(raw, 'FetchHealthSummary'));
    const h2g = rec<FetchH2GHeader>(bodyOf(raw, 'FetchH2GHeader'));
    const header = rec(summary.header);
    return {
      header: {
        patientAge: textOrNull(header.patientAge),
        bloodType: textOrNull(header.bloodType),
        height: measurement(header.height),
        weight: measurement(header.weight),
      },
      patientFirstName: textOrNull(summary.patientFirstName),
      isPatientAdmitted: boolOrNull(summary.isPatientAdmitted),
      conditionList: list(summary.conditionList),
      journeyList: list(summary.journeyList),
      actionPlans: list(summary.actionPlans),
      lastVisit: visitPointer(h2g.lastVisit),
      nextVisit: visitPointer(h2g.nextVisit),
    };
  },
  concise(standard) {
    return {
      header: standard.header,
      isPatientAdmitted: standard.isPatientAdmitted,
      lastVisit: standard.lastVisit,
      nextVisit: standard.nextVisit,
    };
  },
};
