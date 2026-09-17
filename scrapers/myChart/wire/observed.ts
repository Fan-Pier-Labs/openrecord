/**
 * Shapes seen on a real instance that the capture harness never got to record.
 *
 * A container that was `null` (or an empty array) on all three captured
 * instances gives the harness nothing to describe, so `./shapes.ts` widens it
 * to `unknown`. That is honest, but it is not all we know: the scraper's
 * original hand-written response types, written in the first commit by reading
 * live MyChart responses in a browser, described several of those containers.
 * This file is where that knowledge lives now, spliced in by `./shapes.ts`.
 *
 * **These are weaker evidence than a capture** — one developer's reading of one
 * account at one point in time, never re-confirmed by the harness. Every entry
 * says where it came from. When a capture finally observes one populated, the
 * capture wins and the entry here goes.
 *
 * A key here only does something if a captured shape actually has that field;
 * if the captures stop carrying it, the splice silently stops applying. That is
 * what the compile-time assertions in
 * `../__tests__/wireShapes.unit.test.ts` are for — they fail the build if one
 * of these stops reaching the shape it is meant to fill.
 *
 * Tracked in https://github.com/Fan-Pier-Labs/openrecord/issues/484.
 */

/**
 * Nested objects on a visit row. Source: the `TelemedicineInfo`, `EVisitInfo`,
 * `CopayInfo`, `CaseInfo`, `ComponentVisit` and admission-range interfaces in
 * the deleted `chart/visits/types.ts` (first commit, cafcdff5).
 *
 * `visits.processor.ts` reads exactly these fields and already guards every one
 * with `isObject`, which is why it kept working while the type said `unknown`.
 */
export type ObservedVisit = {
  Telemedicine: { IsTelemedicine: boolean; TelemedicineUrl: unknown; TelemedicineMode: number };
  EVisit: { IsEVisit: boolean };
  Copay: { Amount: string; IsPaid: boolean };
  Cases: { CaseId: string; Description: string }[];
  ComponentVisits: { Csn: string; VisitTypeName: string; PrimaryDate: string }[];
  AdmissionDateRange: { Start: string; End: string };
};

/**
 * Source: the `EstimateInfo` interface in the deleted `chart/bills/types.ts`
 * (first commit). `bills.processor.ts:418` reads both fields off it.
 */
export type ObservedBillingVisit = {
  EstimateInfo: { EstimateAmount: string; EstimateStatus: number };
};
