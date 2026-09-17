/**
 * What `get_immunizations` returns: the standard objects the processor builds
 * from MyChart's response. MyChart's own shape is in `./mychart.types.ts`.
 */

export interface ImmunizationStandard {
  name: string | null;
  formattedAdministeredDates: string[];
  id: string | null;
  /** Derived: `organization.organizationName` of the enclosing group. */
  organizationName: string | null;
}

export interface ImmunizationsStandard {
  immunizations: ImmunizationStandard[];
}
