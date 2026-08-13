import { describe, it, expect, afterEach, beforeEach, afterAll, setSystemTime } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { savePasskeyCredential, loadPasskeyCredential } from '../passkeyStore';
import type { PasskeyCredential } from '../../../scrapers/myChart/softwareAuthenticator';

const PASSKEY_DIR = path.join(process.cwd(), '.passkey-credentials');

/**
 * The archive name is `hostname.<ISO timestamp>.json`, so two saves in the same
 * millisecond archive to the same path and the second rename eats the first.
 * The clock is faked and stepped by hand instead of sleeping between saves:
 * a real 10ms sleep only made the collision unlikely, and "unlikely" on a
 * loaded CI box is the definition of a flake.
 */
const CLOCK_START = new Date('2026-03-01T12:00:00.000Z');
let clock = CLOCK_START.getTime();

/** Move the faked clock forward, so the next archive gets its own filename. */
function advanceClock(ms = 1000): void {
  clock += ms;
  setSystemTime(new Date(clock));
}

function makeCredential(overrides: Partial<PasskeyCredential> = {}): PasskeyCredential {
  return {
    credentialId: 'dGVzdC1jcmVkLWlk',
    privateKey: 'dGVzdC1wcml2YXRlLWtleQ==',
    rpId: 'mychart.example.org',
    userHandle: 'dGVzdC11c2VyLWhhbmRsZQ==',
    signCount: 0,
    ...overrides,
  };
}

describe('passkeyStore', () => {
  // Random rather than time-derived: the clock is frozen below, so a
  // timestamped name would be the same on every run and leftovers from a
  // crashed one would throw the archive counts off.
  const testHostname = `test-passkey-${randomUUID()}`;

  beforeEach(() => {
    clock = CLOCK_START.getTime();
    setSystemTime(CLOCK_START);
  });

  afterAll(() => {
    setSystemTime();
  });

  afterEach(async () => {
    // Clean up test files
    try {
      const files = await fs.promises.readdir(PASSKEY_DIR);
      for (const f of files) {
        if (f.startsWith(testHostname)) {
          await fs.promises.unlink(path.join(PASSKEY_DIR, f));
        }
      }
    } catch {
      // Dir may not exist
    }
  });

  it('saves and loads a passkey credential', async () => {
    const cred = makeCredential();
    await savePasskeyCredential(testHostname, cred);

    const loaded = await loadPasskeyCredential(testHostname);
    expect(loaded).not.toBeNull();
    expect(loaded!.credentialId).toBe(cred.credentialId);
    expect(loaded!.privateKey).toBe(cred.privateKey);
    expect(loaded!.rpId).toBe(cred.rpId);
    expect(loaded!.userHandle).toBe(cred.userHandle);
    expect(loaded!.signCount).toBe(cred.signCount);
  });

  it('returns null for non-existent hostname', async () => {
    const loaded = await loadPasskeyCredential('nonexistent-host-12345');
    expect(loaded).toBeNull();
  });

  it('archives existing credential before saving new one', async () => {
    const cred1 = makeCredential({ signCount: 1 });
    const cred2 = makeCredential({ signCount: 2, credentialId: 'bmV3LWNyZWQtaWQ=' });

    await savePasskeyCredential(testHostname, cred1);
    await savePasskeyCredential(testHostname, cred2);

    // The active credential should be the new one
    const loaded = await loadPasskeyCredential(testHostname);
    expect(loaded).not.toBeNull();
    expect(loaded!.credentialId).toBe('bmV3LWNyZWQtaWQ=');
    expect(loaded!.signCount).toBe(2);

    // There should be an archived file
    const files = await fs.promises.readdir(PASSKEY_DIR);
    const archived = files.filter(f => f.startsWith(testHostname) && f !== `${testHostname}.json`);
    expect(archived.length).toBe(1);
    expect(archived[0]).toMatch(/\.json$/);

    // Archived file should contain the old credential
    const archivedContent = JSON.parse(
      await fs.promises.readFile(path.join(PASSKEY_DIR, archived[0]), 'utf-8')
    );
    expect(archivedContent.credentialId).toBe('dGVzdC1jcmVkLWlk');
    expect(archivedContent.signCount).toBe(1);
  });

  it('handles triple save with multiple archives', async () => {
    await savePasskeyCredential(testHostname, makeCredential({ signCount: 1 }));
    advanceClock(); // each archive needs its own timestamped filename
    await savePasskeyCredential(testHostname, makeCredential({ signCount: 2 }));
    advanceClock();
    await savePasskeyCredential(testHostname, makeCredential({ signCount: 3 }));

    const loaded = await loadPasskeyCredential(testHostname);
    expect(loaded!.signCount).toBe(3);

    const files = await fs.promises.readdir(PASSKEY_DIR);
    const archived = files.filter(f => f.startsWith(testHostname) && f !== `${testHostname}.json`);
    expect(archived.length).toBe(2);
  });
});
