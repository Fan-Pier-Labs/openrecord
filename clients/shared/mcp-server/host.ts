// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * What differs between the clients that run this MCP server: the Claude Desktop
 * extension (`mcpb`) and `mychart-cli mcp` (`cli-mcp`). Everything else — every
 * tool, the saved accounts, sign-in — is the same server.
 */
export interface McpHost {
  /** Telemetry app name and Sentry release prefix. */
  app: 'mcpb' | 'cli-mcp';
  version: string;
  /** The setup widget page, served as an MCP Apps resource. Without it, setup is chat-only. */
  setupWidgetHtml?: string;
  /** Tools only this host has, registered after the account tools and before the capability tools. */
  registerExtraTools?: (server: McpServer) => void;
  /** Extra top-level fields for list_accounts' result. */
  listAccountsExtra?: () => Record<string, unknown>;
}

/** Which release the update notice compares against. */
export function updateTarget(host: McpHost): 'mcpb' | 'cli' {
  return host.app === 'mcpb' ? 'mcpb' : 'cli';
}
