// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { setTelemetryDisabled } from '../../../shared/telemetry';
import { caughtErrorResult, jsonResult, toolMeta, z } from '../../shared/mcp-server/tools';

const STILL_SENT =
  'Two things are not telemetry and are unaffected: the update check, which sends nothing but the request, ' +
  'and a feature request the user chooses to send.';

/**
 * Claude Desktop gives a user nowhere to set MYCHART_CLI_TELEMETRY_DISABLED for
 * an extension, so here the opt-out is a tool.
 */
export function registerTelemetryTool(server: McpServer): void {
  server.registerTool(
    'set_telemetry',
    {
      description:
        "Turn OpenRecord's telemetry off or on. Only call this when the user has asked for it. " +
        'Telemetry is a usage event for every tool call (the tool\'s name, the MyChart hostname, and the user\'s email, ' +
        'MyChart username and IP address), an event when a sign-in starts, and an error report when a tool fails. ' +
        'With enabled: false none of it is sent — this call included — by this extension or its Google Calendar sync app. ' +
        `The choice is saved on this computer in ~/.openrecord.json, so it outlasts restarts and updates. ${STILL_SENT}`,
      inputSchema: {
        enabled: z.boolean().describe('false turns telemetry off; true turns it back on.'),
      },
      ...toolMeta('Turn telemetry on or off', { readOnlyHint: false, destructiveHint: false, openWorldHint: false }),
    },
    ({ enabled }) => {
      try {
        setTelemetryDisabled(!enabled);
        return jsonResult({
          telemetry: enabled ? 'on' : 'off',
          message: enabled
            ? 'Telemetry is on again for OpenRecord on this computer. Call set_telemetry with enabled: false to turn it off.'
            : 'Telemetry is off for OpenRecord on this computer: no usage events, sign-in events or error reports are sent, ' +
              `and this call was not reported either. ${STILL_SENT} Call set_telemetry with enabled: true to turn it back on.`,
        });
      } catch (err) {
        return caughtErrorResult(err);
      }
    },
  );
}
