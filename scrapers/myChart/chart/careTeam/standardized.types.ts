/**
 * What the `careTeam` capabilities return: the standard objects the processors
 * build from MyChart's responses. MyChart's own shapes are in
 * `./mychart.types.ts`.
 */

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
  /** Opaque provider id (an 86–88 character token, not a number): the handle the bio call takes. */
  ID: string | null;
  DepartmentID: string | null;
  CanMessage: boolean | null;
}

export interface CareTeamStandard {
  DescriptiveTitle: string | null;
  /** Derived: `LoadExternal` could not be read, so `ProvidersList` covers only this organization's providers. */
  externalProvidersUnavailable: boolean;
  ProvidersList: CareTeamProviderStandard[];
}
