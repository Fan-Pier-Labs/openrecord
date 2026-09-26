/**
 * What the `healthIssues` capabilities return: the standard objects the processors
 * build from MyChart's responses. MyChart's own shapes are in
 * `./mychart.types.ts`.
 */

export interface HealthIssueStandard {
  healthIssueItem: {
    name: string | null;
    formattedDateNoted: string | null;
    id: string | null;
    isReadOnly: boolean | null;
  };
  /** Other organizations' versions of the same problem (shape uncaptured). */
  externalItems: unknown[];
  externalOrgs: unknown[];
  hasLocalInstance: boolean | null;
}

export interface HealthIssuesStandard {
  dataList: HealthIssueStandard[];
}
