/**
 * Stub for Node's `fs` module.
 * The main repo scrapers import `fs` but only use it in TEST-only methods
 * (saveCookies_TEST, loadCookies_TEST, readTestCredentials).
 * These methods are never called at runtime in the mobile app.
 */
const fs = {
  readFileSync: () => { throw new Error("fs.readFileSync not available in React Native"); },
  promises: {
    // Promise.reject (not a sync throw) so callers observe the same rejected
    // promise fs.promises would produce.
    readFile: () => Promise.reject(new Error("fs.promises.readFile not available in React Native")),
    writeFile: () => Promise.reject(new Error("fs.promises.writeFile not available in React Native")),
    mkdir: () => Promise.reject(new Error("fs.promises.mkdir not available in React Native")),
  },
  existsSync: () => false,
};

export default fs;
