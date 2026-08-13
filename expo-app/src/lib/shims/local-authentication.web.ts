 
/**
 * Web shim for expo-local-authentication — always succeeds.
 */

// These mirror an async native API, so they return promises without awaiting.
export function hasHardwareAsync(): Promise<boolean> {
  return Promise.resolve(false);
}

export function isEnrolledAsync(): Promise<boolean> {
  return Promise.resolve(false);
}

export function authenticateAsync(_options?: {
  promptMessage?: string;
  fallbackLabel?: string;
  disableDeviceFallback?: boolean;
}): Promise<{ success: boolean }> {
  return Promise.resolve({ success: true });
}
