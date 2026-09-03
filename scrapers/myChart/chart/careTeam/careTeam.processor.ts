/**
 * Care team processor. Field decisions: docs/processor-layer-proposal.md, `get_care_team`.
 *
 * The scraper records `POST /Clinical/CareTeam/Load` and `LoadExternal`. The
 * two lists are merged under MyChart's own `ProvidersList` name with a derived
 * `fromExternalList` on every row (distinct from `IsExternal`, which the
 * internal list can also set).
 *
 * A `Load` response without a `ProvidersList` array THROWS. The previous
 * version of this scraper was withdrawn (#313) for guessing at the envelope,
 * because a wrong guess here does not fail visibly: it renders to the patient
 * as "you have no care team". A non-2xx status, a login page in place of
 * JSON, or an unrecognized envelope are all errors, never an empty team.
 *
 * `LoadExternal` is optional per deployment (Care Everywhere), so a failure
 * there — a recorded non-JSON or non-envelope response, or no recorded
 * request at all because the call threw — sets `externalProvidersUnavailable`
 * rather than failing the whole read. A partial care team presented as the
 * whole one is the failure that flag exists to prevent.
 *
 * `AboutMeBlurb` (`[]` on every provider of four instances) and
 * `Organizations` / `SchedulableVisitTypes` (`null` on all four) are not
 * surfaced: their shapes are unknown.
 */

import type { RawResponse } from '../../core/rawResponse';
import type { Processor } from '../../processors/processor';
import { boolOrNull, list, rec, textOrNull } from '../../processors/read';

export interface CareTeamProviderStandard {
  Name: string | null;
  /** Role on the team; `null` for no stated role, which most of one account's were. An entry can be the insurance payer. */
  Relation: string | null;
  Specialty: string | null;
  IsExternal: boolean | null;
  /** Derived: the row came from `LoadExternal`. */
  fromExternalList: boolean;
  /** Opaque provider id (an 86–88 character token, not a number). */
  ID: string | null;
  NationalProviderID: string | null;
  DepartmentID: string | null;
  CanMessage: boolean | null;
}

export interface CareTeamStandard {
  DescriptiveTitle: string | null;
  /** Derived: `LoadExternal` could not be read, so `ProvidersList` covers only this organization's providers. */
  externalProvidersUnavailable: boolean;
  ProvidersList: CareTeamProviderStandard[];
}

function provider(value: unknown, fromExternalList: boolean): CareTeamProviderStandard {
  const p = rec(value);
  return {
    Name: textOrNull(p.Name),
    Relation: textOrNull(p.Relation),
    Specialty: textOrNull(p.Specialty),
    IsExternal: boolOrNull(p.IsExternal),
    fromExternalList,
    ID: textOrNull(p.ID),
    NationalProviderID: textOrNull(p.NationalProviderID),
    DepartmentID: textOrNull(p.DepartmentID),
    CanMessage: boolOrNull(p.CanMessage),
  };
}

/** The `ProvidersList` array of a recorded response, or null when the response is not a recognizable envelope. */
function providersListOf(body: unknown): unknown[] | null {
  const envelope = rec(body);
  return Array.isArray(envelope.ProvidersList) ? envelope.ProvidersList : null;
}

export const careTeamProcessor: Processor<CareTeamStandard> = {
  standard(raw: RawResponse): CareTeamStandard {
    // Exact path, not a fragment: `Load` is a prefix of `LoadExternal`, and the
    // two are fetched in parallel, so whichever answered first is recorded
    // first. A fragment match handed the outside providers back as the care
    // team on every run where LoadExternal won the race.
    const load = raw.requests.find((r) => r.path.toLowerCase().endsWith('/clinical/careteam/load'));
    const internal = load ? providersListOf(load.body) : null;
    if (!load || load.status < 200 || load.status >= 300) {
      throw new Error(`/Clinical/CareTeam/Load returned HTTP ${load?.status ?? 'nothing'}`);
    }
    if (internal === null) {
      throw new Error(
        '/Clinical/CareTeam/Load returned no ProvidersList array. Refusing to report an ' +
          'empty care team from a response shape we don\'t recognize (the session may have ' +
          'expired, or this instance does not serve the Care Team activity).',
      );
    }

    const loadExternal = raw.requests.find((r) => r.path.toLowerCase().endsWith('/clinical/careteam/loadexternal'));
    const external =
      loadExternal && loadExternal.status >= 200 && loadExternal.status < 300 ? providersListOf(loadExternal.body) : null;

    return {
      DescriptiveTitle: textOrNull(rec(load.body).DescriptiveTitle),
      externalProvidersUnavailable: external === null,
      ProvidersList: [
        ...internal.map((p) => provider(p, false)),
        ...list(external).map((p) => provider(p, true)),
      ],
    };
  },

  concise(standard) {
    return {
      externalProvidersUnavailable: standard.externalProvidersUnavailable,
      ProvidersList: standard.ProvidersList.map((p) => ({
        Name: p.Name,
        Relation: p.Relation,
        Specialty: p.Specialty,
        IsExternal: p.IsExternal,
        fromExternalList: p.fromExternalList,
      })),
    };
  },
};
