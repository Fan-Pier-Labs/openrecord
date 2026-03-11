/**
 * Web app session helpers — thin wrapper around the shared sessionStore.
 *
 * All session state (web app + MCP) lives in the same sessionStore,
 * sharing the same cookie jars and keepalive.
 */

import { MyChartRequest } from './mychart/myChartRequest';
import { sessionStore } from '../../../scrapers/myChart/sessionStore';

export { sessionStore };

export const SESSION_COOKIE_NAME = 'session_token';
export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24; // 24 hours

// Track which tokens have explicit metadata (for getSessionMetadata compat)
const explicitMetadata = new Map<string, { hostname: string }>();

export function randomToken(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function setSession(token: string, request: MyChartRequest, metadata?: { hostname: string }) {
  sessionStore.set(token, request, { hostname: metadata?.hostname });
  if (metadata) {
    explicitMetadata.set(token, metadata);
  }
}

export function getSession(token: string): MyChartRequest | undefined {
  return sessionStore.get(token);
}

export function getSessionMetadata(token: string): { hostname: string } | undefined {
  return explicitMetadata.get(token);
}

export function deleteSession(token: string) {
  sessionStore.delete(token);
  explicitMetadata.delete(token);
}
