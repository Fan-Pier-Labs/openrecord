// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import type { McpHost } from '../../shared/mcp-server/host';
import { version } from '../manifest.json';
import { registerCalendarTools } from './calendar-tools';
import { calendarSyncStatus } from './google-calendar/applet';
import { registerTelemetryTool } from './telemetry-tool';

/**
 * The extension as a host of the shared MCP server. The setup widget's page is
 * added in index.ts, the one file built with the plugin that inlines it.
 */
export const MCPB_HOST: McpHost = {
  app: 'mcpb',
  version,
  registerExtraTools: (server) => {
    registerCalendarTools(server);
    registerTelemetryTool(server);
  },
  listAccountsExtra: () => ({ calendarSync: calendarSyncStatus() }),
};
