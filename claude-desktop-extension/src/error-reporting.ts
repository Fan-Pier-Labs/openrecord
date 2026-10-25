// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import * as Sentry from '@sentry/node';
import { version as MCPB_VERSION } from '../manifest.json';

/** The OpenRecord MCPB project's DSN. Empty leaves Sentry off; errors still reach the analytics Lambda. */
const SENTRY_DSN = '';

export interface ToolErrorContext {
  tool: string;
  hostname?: string | undefined;
  email?: string | undefined;
  username?: string | undefined;
}

/**
 * Sentry's envelopes go out through `fetch`, like every other telemetry
 * request, instead of the SDK's own `http` transport.
 */
const fetchTransport: NonNullable<Sentry.NodeOptions['transport']> = (options) =>
  Sentry.createTransport(options, async (request) => {
    const response = await fetch(options.url, {
      method: 'POST',
      body: request.body as BodyInit,
      ...(options.headers ? { headers: options.headers } : {}),
    });
    return {
      statusCode: response.status,
      headers: {
        'x-sentry-rate-limits': response.headers.get('X-Sentry-Rate-Limits'),
        'retry-after': response.headers.get('Retry-After'),
      },
    };
  });

let startedWith: string | undefined;

function start(dsn: string): void {
  if (startedWith === dsn) return;
  Sentry.initWithoutDefaultIntegrations({
    dsn,
    release: `openrecord-mcpb@${MCPB_VERSION}`,
    // Errors only, and nothing collected on the side. The default integrations
    // would add breadcrumbs of every console line and outgoing request — that is
    // scraper logs and MyChart URLs — and runtime patching of loaded modules.
    integrations: [Sentry.linkedErrorsIntegration(), Sentry.dedupeIntegration()],
    enableRuntimeChannelInjection: false,
    // Every automatic collector off. `user` is set by hand per error; nothing
    // else of the user's — and no tool input or output, which is chart data —
    // may ride along.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
    },
    transport: fetchTransport,
  });
  startedWith = dsn;
}

/** Send one tool call's error to Sentry, with who and what it was about. `dsn` is the test seam. */
export function captureToolError(error: unknown, context: ToolErrorContext, dsn = SENTRY_DSN): void {
  if (!dsn) return;
  try {
    start(dsn);
    Sentry.withScope((scope) => {
      scope.setUser({
        ...(context.email ? { email: context.email } : {}),
        ...(context.username ? { username: context.username } : {}),
        // Sentry fills this in from the IP the event arrives from.
        ip_address: '{{auto}}',
      });
      scope.setTag('tool', context.tool);
      if (context.hostname) scope.setTag('hostname', context.hostname);
      Sentry.captureException(error);
    });
  } catch {
    // Error reporting must never break a tool call.
  }
}

/** Tear the client down, so one test's DSN never outlives it. */
export async function resetErrorReporting(): Promise<void> {
  await Sentry.close();
  startedWith = undefined;
}
