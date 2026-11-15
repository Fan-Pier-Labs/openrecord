#!/usr/bin/env node
// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * OpenRecord MCPB — Claude Desktop Extension entry point.
 *
 * Runs the shared MCP server (clients/shared/mcp-server/server.ts) with the
 * extension's host: the setup widget, inlined here at build time, and the
 * Google Calendar tools. Claude Desktop runs it as `node dist/server.cjs`.
 */

import { routeLogsToStderr, startServer } from '../../shared/mcp-server/server';
import { buildSetupUiHtml } from '../../shared/mcp-server/ui';
import setupWidget from 'virtual:setup-widget';
import { MCPB_HOST } from './host';
import { updateInstalledBinary } from './google-calendar/applet';

routeLogsToStderr();

async function main(): Promise<void> {
  await startServer({ ...MCPB_HOST, setupWidgetHtml: buildSetupUiHtml(setupWidget) });
  updateInstalledBinary().catch((err: unknown) => {
    console.error('[openrecord] calendar sync app update failed:', err instanceof Error ? err.message : err);
  });
}

main().catch((err: unknown) => {
  console.error('[openrecord] fatal:', err);
  process.exit(1);
});
