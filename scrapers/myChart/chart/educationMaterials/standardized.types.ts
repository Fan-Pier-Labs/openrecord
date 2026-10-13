// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * What the `educationMaterials` capabilities return: the standard objects the processors
 * build from MyChart's responses. MyChart's own shapes are in
 * `./mychart.types.ts`.
 */

export interface EducationMaterialStandard {
  displayName: string | null;
  assignedDate: string | null;
  elementId: string | null;
  eduKey: string | null;
  numTopics: number | null;
  wasAssignedThisVisit: boolean | null;
  numPagesReviewed: number | null;
  numPagesUnderstood: number | null;
  numPagesQuestions: number | null;
}

export type EducationMaterialsStandard = EducationMaterialStandard[];
