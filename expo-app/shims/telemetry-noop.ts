 
// No-op telemetry stub for React Native. The real telemetry module uses
// Node's `os`, `crypto`, and `child_process` (for git config), none of
// which are meaningful on a mobile client.
//
// Signature mirrors shared/telemetry.ts so call sites type-check either way.
export function sendTelemetryEvent(
  _eventType?: string,
  _eventProperties?: Record<string, unknown>,
  _source?: string,
): void {}
export async function gatherEnvInfo(): Promise<Record<string, unknown>> {
  return {};
}
