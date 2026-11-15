// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

// No imports: the setup widget's browser bundle uses this too.

/** What the user does to let the browser-password scan read a browser macOS blocked, inside Claude Desktop. */
export const FULL_DISK_ACCESS_STEPS = [
  'Open System Settings → Privacy & Security → Full Disk Access.',
  'Turn on Claude. If it is not listed, click +, choose Claude from Applications, then turn it on.',
  'Quit Claude completely and reopen it, then import again.',
];

/** The same, when the server runs under whatever app launched `mychart-cli mcp`. */
export const FULL_DISK_ACCESS_STEPS_OTHER_HOST = [
  'Open System Settings → Privacy & Security → Full Disk Access.',
  'Turn on the app that runs OpenRecord — your terminal, or the editor or AI app whose MCP settings start `mychart-cli mcp`.',
  'Quit that app completely and reopen it, then import again.',
];
