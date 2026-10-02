/**
 * The `title` + `annotations` half of a tool's registration.
 *
 * MCP carries a tool's human-readable label in two places: `Tool.title`, and
 * the older `ToolAnnotations.title`. Which one a client reads is up to the
 * client, so a tool that fills in only one shows up under its snake_case id in
 * whichever client reads the other. Every tool here — hand-written or derived
 * from `shared/capabilities/` — goes through this so both are filled from one
 * string and neither can be forgotten. `tool-metadata.unit.test.ts` fails the
 * build if a registration skips it.
 */
export function toolMeta(
  title: string,
  hints: { readOnlyHint: boolean; destructiveHint?: boolean; openWorldHint: boolean },
): { title: string; annotations: { title: string; readOnlyHint: boolean; destructiveHint?: boolean; openWorldHint: boolean } } {
  return { title, annotations: { title, ...hints } };
}
