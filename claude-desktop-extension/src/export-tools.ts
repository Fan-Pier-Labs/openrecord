/**
 * The whole-chart export, and grouping it by health issue.
 *
 * `export_everything` is the deterministic part (`shared/export/`): every
 * record, written to a folder in Downloads. Grouping needs judgement — which
 * visit, lab and bill were about the shoulder — and in this client the model
 * on the other end of the conversation is that judgement, so no API key and
 * no second model: Claude reads the index with `list_export_items` and hands
 * its grouping to `organize_export`, which writes the pages.
 *
 * These are composites of registry capabilities rather than registry entries:
 * they need a folder on disk, which only the Node clients have.
 */

import * as path from 'path';
import { z, type ZodRawShape } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { PATIENT_PARAM, type CapabilityContext } from '../../shared/capabilities';
import { exportEverything } from '../../shared/export/exportEverything';
import { createExportDir, exportDirName, nodeExportFolder } from '../../shared/export/nodeExportFolder';
import { listExportItems, organizeExport } from '../../shared/export/organizeExport';
import { lookupAccount } from './credential-store';
import { downloadsDir } from './imaging/save-study';
import { resolveSession } from './session-manager';
import { toolMeta } from './tool-meta';

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

const text = (t: string, isError = false): ToolResult => ({ content: [{ type: 'text', text: t }], ...(isError ? { isError } : {}) });

const EXPORT_DIR_SCHEMA = z
  .string()
  .min(1)
  .describe('The `export_dir` export_everything returned — the absolute path of the export folder.');

function exportFolder(dir: string) {
  if (!path.isAbsolute(dir)) throw new Error('export_dir must be the absolute path export_everything returned.');
  return nodeExportFolder(dir);
}

export function registerExportTools(
  server: McpServer,
  contextFor: (account: string) => CapabilityContext,
  /** Where exports land; the test seam. The product always uses Downloads. */
  baseDir: () => string = downloadsDir,
): void {
  server.registerTool(
    'export_everything',
    {
      description:
        "Export the patient's ENTIRE chart to a new folder in the user's Downloads: every category OpenRecord reads " +
        '(as JSON and as readable Markdown), one file per visit with its clinical notes and After Visit Summary, every ' +
        'message thread and its attachments, every Document Center file, every billing statement PDF, every imaging ' +
        'study as full-resolution JPEGs, and an index of every record. Use when the user wants to download, export, ' +
        'back up or keep a copy of all their records. Deterministic — it does not pass the chart through the ' +
        'conversation. A large chart takes several minutes; if the call is parked, collect it with ' +
        'check_pending_call — the folder keeps filling either way. If the user also wants it organized by health ' +
        'issue, follow with list_export_items and organize_export.',
      inputSchema: {
        account: z.string().describe('Which connected MyChart account to export, as `username@hostname` from list_accounts.'),
        patient: z.string().optional().describe(PATIENT_PARAM.description),
      } satisfies ZodRawShape,
      ...toolMeta('Export the whole chart', { readOnlyHint: true, openWorldHint: true }),
    },
    async ({ account, patient }) => {
      try {
        const session = await resolveSession(account);
        const hostname = lookupAccount(account)?.hostname ?? account;
        const dir = createExportDir(baseDir(), exportDirName(hostname));
        const index = await exportEverything(session, nodeExportFolder(dir), {
          hostname,
          patient,
          ctx: contextFor(account),
        });
        const counts: Record<string, number> = {};
        for (const item of index.items) counts[item.category] = (counts[item.category] ?? 0) + 1;
        return text(
          JSON.stringify(
            {
              export_dir: dir,
              records: index.items.length,
              files: index.items.reduce((n, item) => n + item.files.length, 0),
              by_category: counts,
              not_exported: index.failures.length,
              ...(index.failures.length ? { not_exported_examples: index.failures.slice(0, 5) } : {}),
              next:
                'Tell the user where the folder is (README.md inside explains it; failures are listed there). To group ' +
                'by health issue, call list_export_items with this export_dir, then organize_export.',
            },
            null,
            2,
          ),
        );
      } catch (err) {
        return text((err as Error).message, true);
      }
    },
  );

  server.registerTool(
    'list_export_items',
    {
      description:
        'List the records in a finished export, one line each: `id | date | type | title | context` (provider, ' +
        'diagnoses, lab components, the opening of the visit note). Read every page — follow `next_offset` until it is ' +
        'null — before deciding health-issue groups for organize_export.',
      inputSchema: {
        export_dir: EXPORT_DIR_SCHEMA,
        offset: z.number().int().min(0).optional().describe('Where to start; the `next_offset` of the previous page.'),
      } satisfies ZodRawShape,
      ...toolMeta('List exported records', { readOnlyHint: true, openWorldHint: false }),
    },
    async ({ export_dir, offset }) => {
      try {
        const page = await listExportItems(exportFolder(export_dir), offset ?? 0);
        return text(
          [`total: ${page.total}   next_offset: ${page.nextOffset ?? 'null'}`, '', ...page.items].join('\n'),
        );
      } catch (err) {
        return text((err as Error).message, true);
      }
    },
  );

  server.registerTool(
    'organize_export',
    {
      description:
        'Group an export by health issue. Pass one group per issue the user has (e.g. "Left shoulder", "Type 2 ' +
        'diabetes"), each with the ids from list_export_items of every record about it — visits, notes, labs, ' +
        'imaging, messages, documents, bills, medications. A record may be in several groups; leave out what fits ' +
        'none. Writes a "By health issue" folder in the export with one dated timeline page per issue linking to the ' +
        'records. Calling it again rewrites those pages.',
      inputSchema: {
        export_dir: EXPORT_DIR_SCHEMA,
        groups: z
          .array(
            z.object({
              name: z.string().min(1).describe('The health issue, in plain words.'),
              summary: z.string().optional().describe('One or two sentences: what it is and how it has gone, from the records.'),
              item_ids: z.array(z.string()).describe('Ids from list_export_items, copied verbatim.'),
            }),
          )
          .min(1),
      } satisfies ZodRawShape,
      ...toolMeta('Group an export by health issue', { readOnlyHint: false, destructiveHint: false, openWorldHint: false }),
    },
    async ({ export_dir, groups }) => {
      try {
        const result = await organizeExport(exportFolder(export_dir), groups);
        return text(
          JSON.stringify(
            {
              written: result.pages.map((p) => path.join(export_dir, ...p.split('/'))),
              ungrouped_records: result.ungrouped,
              ...(result.unknownIds.length
                ? { unknown_ids: result.unknownIds, note: 'These ids are not in the export and were skipped.' }
                : {}),
            },
            null,
            2,
          ),
        );
      } catch (err) {
        return text((err as Error).message, true);
      }
    },
  );
}
