import { eq, and, isNotNull, sql, desc } from 'drizzle-orm';
import { getDb } from './drizzle';
import { mychartInstances, user } from './schema';
import { encrypt, decrypt } from './mcp/encryption';

export interface MyChartInstance {
  id: string;
  userId: string;
  hostname: string;
  username: string;
  password: string;
  totpSecret: string | null;
  mychartEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
  notificationsLastCheckedAt: Date | null;
}

export interface CreateMyChartInstanceInput {
  hostname: string;
  username: string;
  password: string;
  totpSecret?: string;
  mychartEmail?: string;
}

export interface UpdateMyChartInstanceInput {
  hostname?: string;
  username?: string;
  password?: string;
  totpSecret?: string | null;
  mychartEmail?: string | null;
}

async function rowToInstance(row: typeof mychartInstances.$inferSelect): Promise<MyChartInstance> {
  return {
    id: row.id,
    userId: row.userId,
    hostname: row.hostname,
    username: row.username,
    password: await decrypt(row.encryptedPassword),
    totpSecret: row.encryptedTotpSecret ? await decrypt(row.encryptedTotpSecret) : null,
    mychartEmail: row.mychartEmail,
    createdAt: row.createdAt!,
    updatedAt: row.updatedAt!,
    notificationsLastCheckedAt: row.notificationsLastCheckedAt,
  };
}

export async function createMyChartInstance(userId: string, input: CreateMyChartInstanceInput): Promise<MyChartInstance> {
  const db = await getDb();
  const encryptedPassword = await encrypt(input.password);
  const encryptedTotp = input.totpSecret ? await encrypt(input.totpSecret) : null;

  const [row] = await db.insert(mychartInstances).values({
    userId,
    hostname: input.hostname,
    username: input.username,
    encryptedPassword,
    encryptedTotpSecret: encryptedTotp,
    mychartEmail: input.mychartEmail ?? null,
  }).returning();

  return rowToInstance(row);
}

export async function getMyChartInstances(userId: string): Promise<MyChartInstance[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(mychartInstances)
    .where(eq(mychartInstances.userId, userId))
    .orderBy(desc(mychartInstances.createdAt));

  return Promise.all(rows.map(rowToInstance));
}

export async function getMyChartInstance(id: string, userId: string): Promise<MyChartInstance | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(mychartInstances)
    .where(and(eq(mychartInstances.id, id), eq(mychartInstances.userId, userId)));

  if (!row) return null;
  return rowToInstance(row);
}

export async function updateMyChartInstance(id: string, userId: string, updates: UpdateMyChartInstanceInput): Promise<MyChartInstance | null> {
  const db = await getDb();

  const setValues: Partial<typeof mychartInstances.$inferInsert> = {};

  if (updates.hostname !== undefined) setValues.hostname = updates.hostname;
  if (updates.username !== undefined) setValues.username = updates.username;
  if (updates.password !== undefined) setValues.encryptedPassword = await encrypt(updates.password);
  if (updates.totpSecret !== undefined) {
    setValues.encryptedTotpSecret = updates.totpSecret ? await encrypt(updates.totpSecret) : null;
  }
  if (updates.mychartEmail !== undefined) setValues.mychartEmail = updates.mychartEmail;

  if (Object.keys(setValues).length === 0) {
    return getMyChartInstance(id, userId);
  }

  setValues.updatedAt = new Date();

  const [row] = await db
    .update(mychartInstances)
    .set(setValues)
    .where(and(eq(mychartInstances.id, id), eq(mychartInstances.userId, userId)))
    .returning();

  if (!row) return null;
  return rowToInstance(row);
}

export async function deleteMyChartInstance(id: string, userId: string): Promise<boolean> {
  const db = await getDb();
  const result = await db
    .delete(mychartInstances)
    .where(and(eq(mychartInstances.id, id), eq(mychartInstances.userId, userId)))
    .returning({ id: mychartInstances.id });

  return result.length > 0;
}

// ── Notification helpers ──

export interface NotificationEnabledInstance extends MyChartInstance {
  userEmail: string;
  includeContent: boolean;
}

export async function getNotificationEnabledInstances(): Promise<NotificationEnabledInstance[]> {
  const db = await getDb();
  const rows = await db
    .select({
      instance: mychartInstances,
      userEmail: user.email,
      notificationsIncludeContent: user.notificationsIncludeContent,
    })
    .from(mychartInstances)
    .innerJoin(user, eq(mychartInstances.userId, user.id))
    .where(and(
      eq(user.notificationsEnabled, true),
      isNotNull(mychartInstances.encryptedTotpSecret),
    ))
    .orderBy(mychartInstances.createdAt);

  const instances = await Promise.all(rows.map(async (row) => {
    const instance = await rowToInstance(row.instance);
    return {
      ...instance,
      userEmail: row.userEmail,
      includeContent: row.notificationsIncludeContent ?? false,
    };
  }));
  return instances;
}

export async function updateNotificationLastChecked(instanceId: string, userId: string): Promise<void> {
  const db = await getDb();
  await db
    .update(mychartInstances)
    .set({ notificationsLastCheckedAt: sql`NOW()` })
    .where(and(eq(mychartInstances.id, instanceId), eq(mychartInstances.userId, userId)));
}

export interface NotificationPreferences {
  enabled: boolean;
  includeContent: boolean;
}

export async function getUserNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  const db = await getDb();
  const [row] = await db
    .select({
      notificationsEnabled: user.notificationsEnabled,
      notificationsIncludeContent: user.notificationsIncludeContent,
    })
    .from(user)
    .where(eq(user.id, userId));

  if (!row) {
    return { enabled: false, includeContent: false };
  }
  return {
    enabled: row.notificationsEnabled ?? false,
    includeContent: row.notificationsIncludeContent ?? false,
  };
}

export async function setUserNotificationPreferences(
  userId: string,
  prefs: NotificationPreferences
): Promise<void> {
  const db = await getDb();
  await db
    .update(user)
    .set({
      notificationsEnabled: prefs.enabled,
      notificationsIncludeContent: prefs.includeContent,
    })
    .where(eq(user.id, userId));
}
