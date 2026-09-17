/**
 * Medications processor. Field decisions: docs/processor-layer-proposal.md, `get_medications`.
 *
 * `LoadMedicationsPage` nests prescriptions under
 * `communityMembers[].prescriptionList.prescriptions[]` and repeats a ~20-field
 * organization object three times per row. Prescriptions are flattened into
 * one list with `organizationName` lifted onto each; the per-list pharmacy
 * work (pickups, deliveries, refills due) is kept per organization under
 * `prescriptionLists`.
 *
 * `medicationKey` is NOT a MyChart field — the captured skeleton has `id` —
 * so only `id` is surfaced (docs/processor-layer-todo.md §2).
 */

import { bodyOf, type RawResponse } from '../../core/rawResponse';
import type { Processor } from '../../processors/processor';
import { boolOrNull, list, num, rec, strings, textOrNull } from '../../processors/read';
import type { LoadMedicationsPage } from './mychart.types';
import type { CostDetailsStandard, MedicationsStandard, PrescriptionListStandard, PrescriptionStandard, RefillDetailsStandard } from './standardized.types';

export type { CostDetailsStandard, LastDispenseStandard, MedicationsStandard, OwningPharmacyStandard, PrescriptionListStandard, PrescriptionStandard, RefillDetailsStandard } from './standardized.types';

function costDetails(value: unknown): CostDetailsStandard {
  const c = rec(value);
  return { formattedCopay: textOrNull(c.formattedCopay), copay: num(c.copay), isCopayPending: boolOrNull(c.isCopayPending) };
}

function refillDetails(value: unknown): RefillDetailsStandard | null {
  if (value === null || value === undefined) return null;
  const r = rec(value);
  const last = rec(r.lastDispense);
  const delivery = rec(last.delivery);
  const pharmacy = rec(r.owningPharmacy);
  return {
    isRefillable: boolOrNull(r.isRefillable),
    refillsRemaining: textOrNull(r.refillsRemaining),
    hasRefillsRemaining: boolOrNull(r.hasRefillsRemaining),
    refillStatus: num(r.refillStatus),
    refillExpirationDate: textOrNull(r.refillExpirationDate),
    refillWarningCode: textOrNull(r.refillWarningCode),
    scheduledFillDate: textOrNull(r.scheduledFillDate),
    externalFillRequestDate: textOrNull(r.externalFillRequestDate),
    nextDispenseDate: textOrNull(r.nextDispenseDate),
    writtenDispenseQuantity: textOrNull(r.writtenDispenseQuantity),
    writtenDispenseUnit: textOrNull(r.writtenDispenseUnit),
    writtenDispenseAmount: textOrNull(r.writtenDispenseAmount),
    daySupply: textOrNull(r.daySupply),
    lastDispense: {
      dispenseQuantity: textOrNull(last.dispenseQuantity),
      dispenseUnit: textOrNull(last.dispenseUnit),
      dispenseAmount: textOrNull(last.dispenseAmount),
      dispenseDate: textOrNull(last.dispenseDate),
      isRxReady: boolOrNull(last.isRxReady),
      dispenseType: num(last.dispenseType),
      costDetails: costDetails(last.costDetails),
      delivery: {
        formattedShipDate: textOrNull(delivery.formattedShipDate),
        formattedAddress: strings(delivery.formattedAddress),
        shipmentTrackingInfo: list(delivery.shipmentTrackingInfo),
      },
    },
    costDetails: costDetails(r.costDetails),
    owningPharmacy: {
      name: textOrNull(pharmacy.name),
      phoneNumber: textOrNull(pharmacy.phoneNumber),
      formattedAddress: strings(pharmacy.formattedAddress),
      hours: list(pharmacy.hours),
      isPreferred: boolOrNull(pharmacy.isPreferred),
    },
  };
}

function prescription(value: unknown, organizationName: string | null): PrescriptionStandard {
  const p = rec(value);
  const friendly = rec(p.patientFriendlyName);
  return {
    id: textOrNull(p.id),
    name: textOrNull(p.name),
    patientFriendlyName: {
      text: textOrNull(friendly.text),
      caption: textOrNull(friendly.caption),
      captionType: textOrNull(friendly.captionType),
    },
    sig: textOrNull(p.sig),
    sigTranslationFromOrder: textOrNull(p.sigTranslationFromOrder),
    dateToDisplay: textOrNull(p.dateToDisplay),
    dateDisplayKey: textOrNull(p.dateDisplayKey),
    formattedDateNoted: textOrNull(p.formattedDateNoted),
    startDate: textOrNull(p.startDate),
    lastUpdateInstant: textOrNull(p.lastUpdateInstant),
    hasFutureStartDate: boolOrNull(p.hasFutureStartDate),
    prescriptionNumber: textOrNull(p.prescriptionNumber),
    authorizingProvider: { name: textOrNull(rec(p.authorizingProvider).name) },
    orderingProvider: { name: textOrNull(rec(p.orderingProvider).name) },
    isPatientReported: boolOrNull(p.isPatientReported),
    isClinicReported: boolOrNull(p.isClinicReported),
    isPendingUpdate: boolOrNull(p.isPendingUpdate),
    pendingUpdateType: num(p.pendingUpdateType),
    isAnticoagulationMed: boolOrNull(p.isAnticoagulationMed),
    isFrequencyPRN: boolOrNull(p.isFrequencyPRN),
    criticalMedMessage: textOrNull(p.criticalMedMessage),
    classList: strings(p.classList),
    varianceComment: textOrNull(p.varianceComment),
    previousTakingDiffSig: textOrNull(p.previousTakingDiffSig),
    previousTakingDiffSigInstant: textOrNull(p.previousTakingDiffSigInstant),
    previousTakingDiffSigCSN: textOrNull(p.previousTakingDiffSigCSN),
    refillDetails: refillDetails(p.refillDetails),
    organizationName,
  };
}

export const medicationsProcessor: Processor<MedicationsStandard> = {
  standard(raw: RawResponse): MedicationsStandard {
    const body = rec<LoadMedicationsPage>(bodyOf(raw, 'LoadMedicationsPage'));
    const prescriptions: PrescriptionStandard[] = [];
    const prescriptionLists: PrescriptionListStandard[] = [];
    for (const member of list(body.communityMembers)) {
      const m = rec(member);
      const organizationName = textOrNull(rec(m.organization).organizationName);
      const pl = rec(m.prescriptionList);
      for (const rx of list(pl.prescriptions)) prescriptions.push(prescription(rx, organizationName));
      prescriptionLists.push({
        organizationName,
        numRefillsDueSoon: num(pl.numRefillsDueSoon),
        previousTakingValuesDate: textOrNull(pl.previousTakingValuesDate),
        pickups: list(pl.pickups),
        deliveries: list(pl.deliveries),
        inProgressWorkRequests: list(pl.inProgressWorkRequests),
      });
    }
    return { getPatientFirstName: textOrNull(body.getPatientFirstName), prescriptions, prescriptionLists };
  },
  concise(standard) {
    return {
      prescriptions: standard.prescriptions.map((p) => ({
        id: p.id,
        name: p.name,
        patientFriendlyName: p.patientFriendlyName.text,
        sig: p.sig,
        dateToDisplay: p.dateToDisplay,
        dateDisplayKey: p.dateDisplayKey,
        authorizingProvider: p.authorizingProvider.name,
        isPatientReported: p.isPatientReported,
        isRefillable: p.refillDetails?.isRefillable ?? null,
        refillsRemaining: p.refillDetails?.refillsRemaining ?? null,
        hasRefillsRemaining: p.refillDetails?.hasRefillsRemaining ?? null,
        owningPharmacy: p.refillDetails?.owningPharmacy.name ?? null,
      })),
    };
  },
};
