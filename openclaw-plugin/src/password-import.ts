/**
 * Browser password import for MyChart accounts.
 * Wraps read-local-passwords to discover saved MyChart credentials.
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

const CHROME_DB_PATHS: Record<string, string> = {
  darwin: path.join(os.homedir(), 'Library/Application Support/Google/Chrome/Default/Login Data'),
  win32: path.join(os.homedir(), 'AppData/Local/Google/Chrome/User Data/Default/Login Data'),
};

const ARC_DB_PATHS: Record<string, string> = {
  darwin: path.join(os.homedir(), 'Library/Application Support/Arc/User Data/Default/Login Data'),
};

const FIREFOX_PROFILE_DIRS: Record<string, string> = {
  darwin: path.join(os.homedir(), 'Library/Application Support/Firefox/Profiles'),
  win32: path.join(os.homedir(), 'AppData/Roaming/Mozilla/Firefox/Profiles'),
};

/**
 * Check if any browser password databases exist on disk.
 */
export function browserPasswordDbExists(): boolean {
  const platform = os.platform();

  const chromePath = CHROME_DB_PATHS[platform];
  if (chromePath && fs.existsSync(chromePath)) return true;

  const arcPath = ARC_DB_PATHS[platform];
  if (arcPath && fs.existsSync(arcPath)) return true;

  const firefoxDir = FIREFOX_PROFILE_DIRS[platform];
  if (firefoxDir && fs.existsSync(firefoxDir)) {
    try {
      const profiles = fs.readdirSync(firefoxDir);
      for (const profile of profiles) {
        const loginsPath = path.join(firefoxDir, profile, 'logins.json');
        if (fs.existsSync(loginsPath)) return true;
      }
    } catch {
      // ignore
    }
  }

  return false;
}

export interface ImportedAccount {
  hostname: string;
  username: string;
  password: string;
}

/**
 * Import MyChart accounts from browser password stores.
 * Returns an empty array if sqlite3 is unavailable or extraction fails.
 */
export async function importMyChartAccounts(): Promise<ImportedAccount[]> {
  try {
    const { getMyChartAccounts } = await import('../../read-local-passwords/index');
    const accounts = await getMyChartAccounts();
    return accounts.map(a => ({
      hostname: new URL(a.url).hostname,
      username: a.user ?? '',
      password: a.pass,
    }));
  } catch (err) {
    console.log('[mychart-plugin] Could not import browser passwords:', (err as Error).message);
    return [];
  }
}
