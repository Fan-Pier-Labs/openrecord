import { randomBytes, createHash } from 'crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../drizzle';
import { user } from '../schema';

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Generate a new API key for a user. Stores SHA-256 hash in the user table.
 * Returns the plaintext key (shown once to the user).
 */
export async function generateApiKey(userId: string): Promise<string> {
  const key = randomBytes(32).toString('hex');
  const hash = hashKey(key);
  const db = await getDb();
  await db.update(user).set({ mcpApiKeyHash: hash }).where(eq(user.id, userId));
  return key;
}

/**
 * Validate an API key. Returns the userId if valid, null otherwise.
 */
export async function validateApiKey(key: string): Promise<{ userId: string } | null> {
  const hash = hashKey(key);
  const db = await getDb();
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.mcpApiKeyHash, hash));

  if (!row) return null;
  return { userId: row.id };
}

/**
 * Revoke a user's API key by setting the hash to NULL.
 */
export async function revokeApiKey(userId: string): Promise<void> {
  const db = await getDb();
  await db.update(user).set({ mcpApiKeyHash: null }).where(eq(user.id, userId));
}

/**
 * Check if a user has an API key set.
 */
export async function hasApiKey(userId: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db
    .select({ mcpApiKeyHash: user.mcpApiKeyHash })
    .from(user)
    .where(eq(user.id, userId));

  return !!row && row.mcpApiKeyHash !== null;
}
