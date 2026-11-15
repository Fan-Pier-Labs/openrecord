// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import type { McpHost } from '../host';

/** A host with the setup widget, like the extension, minus its Mac-only calendar tools. */
export const TEST_HOST: McpHost = { app: 'mcpb', version: '0.0.0-test', setupWidgetHtml: '<!doctype html>' };
