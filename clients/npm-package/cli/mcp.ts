// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

// `mychart-cli mcp` — OpenRecord's MCP server over stdio, for any MCP client
// (Claude Code, Cursor, VS Code, …). The same server the Claude Desktop
// extension runs, minus its setup widget and Google Calendar tools; accounts
// are shared with the extension. See docs/mcp.md.

import { routeLogsToStderr, startServer } from '../../shared/mcp-server/server';
import { version } from '../package.json';

export function runMcp(): void {
  routeLogsToStderr();
  startServer({ app: 'cli-mcp', version }).catch((err: unknown) => {
    console.error('[openrecord] fatal:', err);
    process.exit(1);
  });
}
