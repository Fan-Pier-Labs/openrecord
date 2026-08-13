/**
 * Stub for mkdirp. Only used by bills.ts for saving files to disk.
 * Never called at runtime in the mobile app.
 */
export function mkdirp(): Promise<undefined> { return Promise.resolve(undefined); }
export default mkdirp;
