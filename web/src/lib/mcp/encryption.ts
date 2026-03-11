import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'crypto';
import { getEncryptionKey } from './config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;

async function deriveKey(salt: Buffer): Promise<Buffer> {
  const secret = await getEncryptionKey();
  return scryptSync(secret, salt, KEY_LENGTH);
}

export async function encrypt(plaintext: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(salt);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: salt + iv + tag + ciphertext, all base64url encoded
  const combined = Buffer.concat([salt, iv, tag, encrypted]);
  return combined.toString('base64url');
}

export async function decrypt(encoded: string): Promise<string> {
  const combined = Buffer.from(encoded, 'base64url');
  const salt = combined.subarray(0, SALT_LENGTH);
  const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const ciphertext = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const key = await deriveKey(salt);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

export async function encryptCredentials(username: string, password: string): Promise<string> {
  return encrypt(JSON.stringify({ username, password }));
}

export async function decryptCredentials(encrypted: string): Promise<{ username: string; password: string }> {
  return JSON.parse(await decrypt(encrypted));
}
