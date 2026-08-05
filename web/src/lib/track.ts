/**
 * Client-side event tracking. Every event fans out to two independent sinks:
 *
 *   1. Amplitude (product analytics UI) — initialized in AmplitudeProvider
 *   2. our own analytics Lambda, which writes to CloudWatch Logs
 *      (repo: Fan-Pier-Labs/openrecord-analytics)
 *
 * Both are best-effort and fully swallowed: analytics must never break the app.
 * The Lambda redacts identifier-shaped property keys server-side and never logs
 * the caller's IP.
 */

/**
 * Self-hosted analytics sink (API Gateway → Lambda → CloudWatch Logs).
 * Redirect it with `NEXT_PUBLIC_ANALYTICS_ENDPOINT`, or turn this sink off
 * entirely with `NEXT_PUBLIC_ANALYTICS_DISABLED=1`.
 *
 * Uses || (not ??) because an unset Docker ARG produces the empty string (not
 * undefined) at build time; we want that to fall through to the default rather
 * than silently disabling the sink. Opting out is the explicit flag's job.
 */
const DEFAULT_ANALYTICS_ENDPOINT = "https://pumlxw0t7e.execute-api.us-east-2.amazonaws.com";

const ANALYTICS_ENDPOINT = process.env.NEXT_PUBLIC_ANALYTICS_DISABLED
  ? ""
  : process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT || DEFAULT_ANALYTICS_ENDPOINT;

const DEVICE_ID_KEY = "openrecord_device_id";

/**
 * A stable random UUID per browser, used only to dedupe events from the same
 * device. Never derived from identifying information. Falls back to a
 * per-page-load UUID when localStorage is unavailable (private mode, blocked
 * storage), so tracking still works but won't dedupe across reloads.
 */
let memoryDeviceId: string | null = null;

function getDeviceId(): string {
  if (memoryDeviceId) return memoryDeviceId;
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing) {
      memoryDeviceId = existing;
      return existing;
    }
    const fresh = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_ID_KEY, fresh);
    memoryDeviceId = fresh;
    return fresh;
  } catch {
    memoryDeviceId = crypto.randomUUID();
    return memoryDeviceId;
  }
}

function sendToAmplitude(event: string, properties?: Record<string, unknown>) {
  import("@amplitude/analytics-browser")
    .then((amplitude) => {
      amplitude.track(event, properties);
    })
    .catch(() => {});
}

function sendToAnalyticsLambda(event: string, properties?: Record<string, unknown>) {
  if (!ANALYTICS_ENDPOINT) return;
  try {
    void fetch(ANALYTICS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // keepalive lets the request outlive a navigation, so events fired right
      // before a route change or tab close still land.
      keepalive: true,
      body: JSON.stringify({
        source: "web",
        deviceId: getDeviceId(),
        event,
        ts: Date.now(),
        properties: properties ?? {},
      }),
    }).catch(() => {});
  } catch {
    // Silently ignore — analytics must never break the app.
  }
}

export function track(event: string, properties?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  sendToAmplitude(event, properties);
  sendToAnalyticsLambda(event, properties);
}
