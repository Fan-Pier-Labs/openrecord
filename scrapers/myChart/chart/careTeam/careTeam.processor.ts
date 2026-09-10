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
 *
 * `NationalProviderID` is not surfaced either, and that one is a trap rather
 * than an unknown: it is named like an NPI but held an Epic-encrypted
 * `WP-$…$…` blob on all 7 providers of the one instance probed for it, so a
 * caller who passed it to `lookup_npi` — as that capability's own docs told
 * them to — always failed the check digit. It stays in `raw` (the `internal` /
 * blob-key class), and the derived `npi` carries the value only when the
 * instance really did put an NPI there.
 */

import { isValidNpi } from '../../../npi/npiRegistry';
import { findRequest, type RawResponse } from '../../core/rawResponse';
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
  /**
   * Derived from `NationalProviderID`: the NPI when the instance sent one,
   * `null` when it sent an encrypted token instead (or nothing). A `null` here
   * means this instance does not hand out NPIs, not that the provider has no
   * NPI — `search_npi_registry` by name is the way to one.
   */
  npi: string | null;
  DepartmentID: string | null;
  CanMessage: boolean | null;
}

export interface CareTeamStandard {
  DescriptiveTitle: string | null;
  /** Derived: `LoadExternal` could not be read, so `ProvidersList` covers only this organization's providers. */
  externalProvidersUnavailable: boolean;
  ProvidersList: CareTeamProviderStandard[];
}

/** A `NationalProviderID` that is a well-formed NPI, or null for the encrypted token an instance may send there instead. */
function npiOrNull(value: unknown): string | null {
  const text = textOrNull(value);
  return text !== null && isValidNpi(text) ? text : null;
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
    npi: npiOrNull(p.NationalProviderID),
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
    const load = findRequest(raw, 'Clinical/CareTeam/Load');
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

    const loadExternal = findRequest(raw, 'Clinical/CareTeam/LoadExternal');
    const external =
      loadExternal && !loadExternal.failure && loadExternal.status >= 200 && loadExternal.status < 300
        ? providersListOf(loadExternal.body)
        : null;

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
