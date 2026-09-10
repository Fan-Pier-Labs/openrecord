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
 * `NationalProviderID` is a trap rather than an unknown: it is named like an
 * NPI but holds an Epic-encrypted `WP-$…$…` blob, so a caller who passed it to
 * `lookup_npi` — as that capability's own docs told them to — always failed the
 * check digit. MyChart's name for it stays in `raw`; `standard` carries the
 * same value as the derived `encryptedNationalProviderID`, which says what it
 * is. The real NPI comes from the scraper's third call: the row's `ID` sent to
 * `/api/Providers/GetProviderBioPrivate` (the page's own "provider details"
 * request) answers with the bio, `npi` in plain digits included. The derived
 * `npi` is that value, matched back to its row by the request body's `id`, and
 * `null` where the bio was not fetched (the page would not link it either) or
 * did not answer.
 */

import { findRequests, type RawRequestRecord, type RawResponse } from '../../core/rawResponse';
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
  /**
   * Derived: the provider's NPI, from `GetProviderBioPrivate`'s `npi` for this
   * row's `ID`. `null` when that bio was not fetched or did not answer — not
   * "no NPI exists".
   */
  npi: string | null;
  /** Opaque provider id (an 86–88 character token, not a number). */
  ID: string | null;
  /**
   * Derived: `NationalProviderID` under a name that does not promise an NPI.
   * The value is an Epic-encrypted token, decodable only by the server, so it
   * identifies the provider to MyChart and to nothing else.
   */
  encryptedNationalProviderID: string | null;
  DepartmentID: string | null;
  CanMessage: boolean | null;
}

export interface CareTeamStandard {
  DescriptiveTitle: string | null;
  /** Derived: `LoadExternal` could not be read, so `ProvidersList` covers only this organization's providers. */
  externalProvidersUnavailable: boolean;
  ProvidersList: CareTeamProviderStandard[];
}

function provider(value: unknown, fromExternalList: boolean, bios: RawRequestRecord[]): CareTeamProviderStandard {
  const p = rec(value);
  const ID = textOrNull(p.ID);
  return {
    Name: textOrNull(p.Name),
    Relation: textOrNull(p.Relation),
    Specialty: textOrNull(p.Specialty),
    IsExternal: boolOrNull(p.IsExternal),
    fromExternalList,
    npi: npiOf(ID, bios),
    ID,
    encryptedNationalProviderID: textOrNull(p.NationalProviderID),
    DepartmentID: textOrNull(p.DepartmentID),
    CanMessage: boolOrNull(p.CanMessage),
  };
}

/** The `npi` of the bio that answered for this row's `ID`, or null. An empty `npi` is null too: MyChart sends `""` for "none". */
function npiOf(ID: string | null, bios: RawRequestRecord[]): string | null {
  if (ID === null) return null;
  const bio = bios.find((r) => rec(r.requestBody).id === ID);
  if (!bio || bio.failure !== undefined || bio.status < 200 || bio.status >= 300) return null;
  const npi = textOrNull(rec(bio.body).npi);
  return npi === '' ? null : npi;
}

/** The `ProvidersList` array of a recorded response, or null when the response is not a recognizable envelope. */
function providersListOf(body: unknown): unknown[] | null {
  const envelope = rec(body);
  return Array.isArray(envelope.ProvidersList) ? envelope.ProvidersList : null;
}

export const careTeamProcessor: Processor<CareTeamStandard> = {
  standard(raw: RawResponse): CareTeamStandard {
    const load = findRequests(raw, 'Clinical/CareTeam/Load')[0];
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

    const loadExternal = findRequests(raw, 'Clinical/CareTeam/LoadExternal')[0];
    const external =
      loadExternal && !loadExternal.failure && loadExternal.status >= 200 && loadExternal.status < 300
        ? providersListOf(loadExternal.body)
        : null;

    const bios = findRequests(raw, 'Providers/GetProviderBioPrivate');

    return {
      DescriptiveTitle: textOrNull(rec(load.body).DescriptiveTitle),
      externalProvidersUnavailable: external === null,
      ProvidersList: [
        ...internal.map((p) => provider(p, false, bios)),
        ...list(external).map((p) => provider(p, true, bios)),
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
        npi: p.npi,
      })),
    };
  },
};
