 
/**
 * Web shim for expo-secure-store — uses localStorage.
 * Only for development/testing. Not secure for production.
 */

export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 0;

export type SecureStoreOptions = {
  keychainAccessible?: number;
};

export function getItemAsync(key: string, _options?: SecureStoreOptions): Promise<string | null> {
  return Promise.resolve(localStorage.getItem(`secure_${key}`));
}

export function setItemAsync(key: string, value: string, _options?: SecureStoreOptions): Promise<void> {
  localStorage.setItem(`secure_${key}`, value);
  return Promise.resolve();
}

export function deleteItemAsync(key: string, _options?: SecureStoreOptions): Promise<void> {
  localStorage.removeItem(`secure_${key}`);
  return Promise.resolve();
}
