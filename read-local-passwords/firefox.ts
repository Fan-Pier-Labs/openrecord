/**
 * Firefox password store (NSS): `key4.db` holds the wrapped keys, `logins.json`
 * the encrypted credentials.
 *
 * Three things here are easy to get wrong, and each was found by running this
 * against a real 969-login profile rather than by reading the format:
 *
 *  1. **Modern Firefox encrypts login fields with AES-256-CBC, not 3DES.** The
 *     algorithm is named per field, so it must be dispatched on, not assumed.
 *  2. **The PBES2 IV is stored as 14 bytes**; the real AES IV is `04 0e` followed
 *     by those 14. Passing the raw 14 bytes fails outright.
 *  3. **`nssPrivate` holds several wrapped keys that share one CKA_ID** — a
 *     24-byte legacy 3DES key and a 32-byte AES key, under the same id. So the
 *     key must be chosen by the length its cipher needs, not by id alone.
 */

import { createDecipheriv, createHash, createHmac, pbkdf2Sync } from 'crypto';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { homedir } from 'os';
import * as path from 'path';
import { child, oidToString, parseDer, readInteger, stripPadding, type DerNode } from './der';
import { toBuffer, withDatabaseCopy } from './sqlite';
import type { PasswordStoreEntry } from './types';

const OID_PBES2 = '1.2.840.113549.1.5.13';
const OID_PBKDF2 = '1.2.840.113549.1.5.12';
const OID_3DES_CBC = '1.2.840.113549.3.7';
const OID_AES256_CBC = '2.16.840.1.101.3.4.1.42';

/** Cipher parameters keyed by the OID a field declares. */
const FIELD_CIPHERS: Record<string, { algorithm: string; keyLength: number; blockSize: number }> = {
  [OID_AES256_CBC]: { algorithm: 'aes-256-cbc', keyLength: 32, blockSize: 16 },
  [OID_3DES_CBC]: { algorithm: 'des-ede3-cbc', keyLength: 24, blockSize: 8 },
};

const sha1 = (...parts: Buffer[]): Buffer => {
  const hash = createHash('sha1');
  for (const part of parts) hash.update(part);
  return hash.digest();
};

const hmacSha1 = (key: Buffer, ...parts: Buffer[]): Buffer => {
  const hmac = createHmac('sha1', key);
  for (const part of parts) hmac.update(part);
  return hmac.digest();
};

/**
 * Undo one NSS password-based encryption blob.
 *
 * `algorithm` is the AlgorithmIdentifier SEQUENCE; `ciphertext` the OCTET STRING
 * beside it. Handles both the modern PBES2/AES form and the legacy
 * pbeWithSha1AndTripleDES form, because a long-lived profile can still hold the
 * latter.
 */
export function pbeDecrypt(algorithm: DerNode, ciphertext: Buffer, globalSalt: Buffer, masterPassword: Buffer): Buffer {
  const algorithmOid = oidToString(child(algorithm, 0).content);
  const parameters = child(algorithm, 1);

  if (algorithmOid === OID_PBES2) {
    const keyDerivation = child(parameters, 0);
    if (oidToString(child(keyDerivation, 0).content) !== OID_PBKDF2) {
      throw new Error('firefox: PBES2 with an unexpected key-derivation function');
    }

    const kdfParameters = child(keyDerivation, 1);
    const salt = child(kdfParameters, 0).content;
    const iterations = readInteger(child(kdfParameters, 1));
    const keyLength = readInteger(child(kdfParameters, 2));

    const storedIv = child(parameters, 1, 1).content;
    // NSS stores 14 IV bytes and reconstructs the DER OCTET STRING header in
    // front of them to make the 16 AES needs.
    const iv = storedIv.length === 14 ? Buffer.concat([Buffer.from([0x04, 0x0e]), storedIv]) : storedIv;

    const key = pbkdf2Sync(sha1(globalSalt, masterPassword), salt, iterations, keyLength, 'sha256');
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    decipher.setAutoPadding(false);
    return stripPadding(Buffer.concat([decipher.update(ciphertext), decipher.final()]), 16);
  }

  // Legacy: pbeWithSha1AndTripleDES-CBC. Key and IV both fall out of one
  // HMAC ladder over the global salt and this entry's salt.
  const entrySalt = child(parameters, 0).content;
  const hashedPassword = sha1(globalSalt, masterPassword);
  const paddedSalt = Buffer.concat([Buffer.alloc(Math.max(0, 20 - entrySalt.length)), entrySalt]).subarray(0, 20);
  const combined = sha1(hashedPassword, entrySalt);
  const firstHalf = hmacSha1(combined, paddedSalt, entrySalt);
  const tk = hmacSha1(combined, paddedSalt);
  const secondHalf = hmacSha1(combined, tk, entrySalt);
  const material = Buffer.concat([firstHalf, secondHalf]);

  const decipher = createDecipheriv('des-ede3-cbc', material.subarray(0, 24), material.subarray(material.length - 8));
  decipher.setAutoPadding(false);
  return stripPadding(Buffer.concat([decipher.update(ciphertext), decipher.final()]), 8);
}

/**
 * Unwrap every key in `key4.db`.
 *
 * Returns the raw key material, longest first, so a caller asking for 32 bytes
 * gets the AES key and one asking for 24 gets a 3DES-sized key — the two
 * routinely share a CKA_ID, which makes id alone useless as a discriminator.
 */
async function unwrapKeys(key4Path: string, masterPassword: Buffer): Promise<Buffer[]> {
  const { meta, privateRows } = await withDatabaseCopy(key4Path, db => ({
    meta: db.all("SELECT item1, item2 FROM metaData WHERE id = 'password'")[0],
    privateRows: db.all('SELECT a11 FROM nssPrivate'),
  }));

  const globalSalt = toBuffer(meta?.item1);
  const passwordCheck = toBuffer(meta?.item2);
  if (!globalSalt || !passwordCheck) throw new Error('firefox: key4.db has no password metadata');

  // Confirms the (empty) master password before anything else is attempted, so
  // a profile with a real master password fails with a clear reason.
  const check = parseDer(passwordCheck);
  const checkText = pbeDecrypt(child(check, 0), child(check, 1).content, globalSalt, masterPassword).toString('utf-8');
  if (checkText !== 'password-check') {
    throw new Error('firefox: profile is protected by a primary password');
  }

  const keys: Buffer[] = [];
  for (const row of privateRows) {
    const wrapped = toBuffer(row.a11);
    if (!wrapped) continue;
    try {
      const node = parseDer(wrapped);
      keys.push(pbeDecrypt(child(node, 0), child(node, 1).content, globalSalt, masterPassword));
    } catch {
      // One unusable key entry should not cost us the others.
    }
  }
  return keys.sort((a, b) => b.length - a.length);
}

/** Decrypt one base64 ASN.1 field from logins.json. Exported for tests. */
export function decryptField(encoded: string, keys: Buffer[]): string {
  const node = parseDer(Buffer.from(encoded, 'base64'));
  const cipherOid = oidToString(child(node, 1, 0).content);
  const spec = FIELD_CIPHERS[cipherOid];
  if (!spec) throw new Error(`firefox: unsupported field cipher ${cipherOid}`);

  // Exact length first. `length >= keyLength` alone would hand a 3DES field the
  // first 24 bytes of the 32-byte AES key — which decrypts to garbage rather
  // than failing, so nothing downstream would notice. Only fall back to a longer
  // key when no key is exactly the right size.
  const key =
    keys.find(candidate => candidate.length === spec.keyLength) ??
    keys.find(candidate => candidate.length > spec.keyLength);
  if (!key) throw new Error(`firefox: no key of at least ${spec.keyLength} bytes`);

  const decipher = createDecipheriv(spec.algorithm, key.subarray(0, spec.keyLength), child(node, 1, 1).content);
  decipher.setAutoPadding(false);
  const plaintext = Buffer.concat([decipher.update(child(node, 2).content), decipher.final()]);
  return stripPadding(plaintext, spec.blockSize).toString('utf-8');
}

function profileRoots(): string[] {
  const home = homedir();
  if (process.platform === 'darwin') return [path.join(home, 'Library', 'Application Support', 'Firefox', 'Profiles')];
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
    return [path.join(appData, 'Mozilla', 'Firefox', 'Profiles')];
  }
  return [path.join(home, '.mozilla', 'firefox')];
}

/** Every credential this machine's Firefox profiles have saved. */
export async function getFirefoxLogins(): Promise<PasswordStoreEntry[]> {
  const entries: PasswordStoreEntry[] = [];

  for (const root of profileRoots()) {
    if (!existsSync(root)) continue;

    for (const directory of readdirSync(root, { withFileTypes: true })) {
      if (!directory.isDirectory()) continue;
      const profile = path.join(root, directory.name);
      const loginsPath = path.join(profile, 'logins.json');
      const key4Path = path.join(profile, 'key4.db');
      if (!existsSync(loginsPath) || !existsSync(key4Path)) continue;

      let keys: Buffer[];
      try {
        keys = await unwrapKeys(key4Path, Buffer.alloc(0));
      } catch {
        continue; // Primary password set, or an unreadable key store.
      }

      let logins: { encryptedUsername?: string; encryptedPassword?: string; hostname?: string; formSubmitURL?: string }[];
      try {
        logins = JSON.parse(readFileSync(loginsPath, 'utf-8')).logins ?? [];
      } catch {
        continue;
      }

      for (const login of logins) {
        if (!login.encryptedPassword) continue;
        try {
          entries.push({
            url: login.hostname || login.formSubmitURL || '',
            user: login.encryptedUsername ? decryptField(login.encryptedUsername, keys) : null,
            pass: decryptField(login.encryptedPassword, keys),
            success: true,
            source: 'Firefox',
          });
        } catch {
          entries.push({
            url: login.hostname || login.formSubmitURL || '',
            user: null,
            pass: null,
            success: false,
            source: 'Firefox',
          });
        }
      }
    }
  }

  return entries;
}
