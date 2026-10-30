// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * Silent session renewal — the one place an expired MyChart session is
 * re-logged-in and put back on the right patient.
 *
 * Only a real request renews (`makeAuthenticatedRequest`, when it bounces to
 * the login page) — never the keepalive heartbeat, whose "dead" turned into a
 * sign-in every 30 seconds on one instance. This is deliberately a LEAF
 * module, importing nothing from the scraper layer, so the graph stays acyclic:
 *
 *   makeAuthenticatedRequest ─→ sessionRenewal ─→ (nothing)
 *   proxyContext ─→ makeAuthenticatedRequest
 *
 * What makes the leaf possible is that both capabilities renewal needs travel
 * ON the request object itself: `reauthenticate` (wired by each client at
 * login) and `restoreProxyContext` (armed by proxyContext whenever the active
 * patient is recorded, alongside `activeProxyTarget`). Renewal calls them; it
 * doesn't need to know where they come from.
 */

import type { MyChartRequest } from './myChartRequest';
import { logger } from '../../../shared/logger';

// Per-request-object renewal state. WeakMap rather than fields on the class so
// the transport stays serialization-clean.
type RenewalState = { renewPromise: Promise<boolean> | null };
const renewalStates = new WeakMap<MyChartRequest, RenewalState>();

function stateFor(mychartRequest: MyChartRequest): RenewalState {
  let state = renewalStates.get(mychartRequest);
  if (!state) {
    state = { renewPromise: null };
    renewalStates.set(mychartRequest, state);
  }
  return state;
}

/**
 * Renew an expired session via the request's `reauthenticate` hook, then
 * restore the active proxy patient if the session had been switched to one.
 *
 * Single-flight per request object: concurrent callers all await the same
 * renewal.
 */
export async function renewMyChartSession(mychartRequest: MyChartRequest): Promise<boolean> {
  const state = stateFor(mychartRequest);
  state.renewPromise ??= doRenew(mychartRequest).finally(() => {
      state.renewPromise = null;
    });
  return state.renewPromise;
}

async function doRenew(mychartRequest: MyChartRequest): Promise<boolean> {
  const reauthenticate = mychartRequest.reauthenticate;
  if (!reauthenticate) {
    logger.debug(`MyChart session for ${mychartRequest.hostname} expired and no reauthenticate hook is wired.`);
    return false;
  }

  logger.warn(`MyChart session for ${mychartRequest.hostname} expired — attempting automatic re-login.`);
  let loggedIn = false;
  try {
    loggedIn = await reauthenticate();
  } catch (error) {
    logger.error(`Automatic re-login for ${mychartRequest.hostname} threw:`, error);
    return false;
  }
  if (!loggedIn) {
    logger.warn(`Automatic re-login for ${mychartRequest.hostname} was not possible.`);
    return false;
  }

  // Re-login resets MyChart's server-side proxy context to the account holder.
  // If this session had been deliberately switched to another patient's
  // record, put it back BEFORE any caller retries — a renewed session that
  // silently reads the wrong patient's chart is the one failure this app must
  // never produce. `restoreProxyContext` is armed together with
  // `activeProxyTarget` (see proxyContext); it re-runs the verified switch
  // with autoRenew: false, so it can only ever fail, never re-enter this
  // renewal. A recorded non-self target with no restore closure fails the
  // renewal outright — never retry on the wrong chart.
  const target = mychartRequest.activeProxyTarget;
  if (target && !target.isSelf) {
    const restore = mychartRequest.restoreProxyContext;
    if (!restore) {
      logger.error(
        `Re-login for ${mychartRequest.hostname} succeeded but no restore hook is armed for the active patient record ('${target.displayName}').`,
      );
      return false;
    }
    try {
      await restore();
    } catch (error) {
      logger.error(
        `Re-login for ${mychartRequest.hostname} succeeded but restoring the active patient record ('${target.displayName}') failed:`,
        error,
      );
      return false;
    }
  }

  logger.info(`MyChart session for ${mychartRequest.hostname} renewed.`);
  return true;
}
