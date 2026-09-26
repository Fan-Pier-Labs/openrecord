/**
 * What the `ehiExport` capabilities return: the standard objects the processors
 * build from MyChart's responses. MyChart's own shapes are in
 * `./mychart.types.ts`.
 */

export interface EhiTemplateStandard {
  name: string | null;
  description: string | null;
  /** Identifier a future export capability would take. */
  id: string | null;
}

export interface EhiExportStandard {
  existingEHIE: boolean | null;
  isNoBuildEhie: boolean | null;
  ehieTemplates: EhiTemplateStandard[];
}
