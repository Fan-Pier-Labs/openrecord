/**
 * The extension's version, single-sourced from manifest.json — the version
 * Claude Desktop displays and upgrades on, so it is the one that counts.
 * package.json must carry the same string (version-sync.unit.test.ts enforces
 * it); index.ts and the update checker read this constant instead of
 * repeating the number.
 */
import manifest from '../manifest.json';

export const EXTENSION_VERSION: string = manifest.version;
