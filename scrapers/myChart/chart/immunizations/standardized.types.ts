/**
 * What the `immunizations` capabilities return: the standard objects the processors
 * build from MyChart's responses. MyChart's own shapes are in
 * `./mychart.types.ts`.
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
