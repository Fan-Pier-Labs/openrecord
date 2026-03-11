/**
 * Web app keepalive — delegates to the shared sessionStore.
 *
 * The sessionStore handles the actual interval and pinging.
 * This module just provides start/stop wrappers for the web app's instrumentation.
 */

import { sessionStore } from '../../../../scrapers/myChart/sessionStore';

let stopFn: (() => void) | null = null;

export function startKeepalive() {
  if (stopFn) return;
  stopFn = sessionStore.startKeepalive();
}

export function stopKeepalive() {
  if (stopFn) {
    stopFn();
    stopFn = null;
  }
}
