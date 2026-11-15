// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

// CLI entry point with subcommand dispatch. This is what the published binary
// is built from (see tsup.config.ts).
// Usage:
//   bun run cli mychart [flags]   — MyChart scraper (default if no subcommand)
//   bun run cli mcp               — the MCP server over stdio

import { runCli } from './cli';
import { runMcp } from './mcp';

const subcommand = process.argv[2];

if (subcommand === 'mcp') {
  runMcp();
} else {
  // If the user typed "bun run cli mychart ...", strip "mychart" before runCli parses argv.
  if (subcommand === 'mychart') {
    process.argv.splice(2, 1);
  }
  void runCli();
}
