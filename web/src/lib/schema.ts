import { pgTable, text, boolean, timestamp, integer, uniqueIndex, index } from 'drizzle-orm/pg-core';

// ── BetterAuth core tables ──

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  emailVerified: boolean('email_verified').notNull().default(false),
  name: text('name').notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  // twoFactor plugin
  twoFactorEnabled: boolean('two_factor_enabled').default(false),
  // Custom columns
  mcpApiKeyHash: text('mcp_api_key_hash').unique(),
  notificationsEnabled: boolean('notifications_enabled').default(false),
  notificationsIncludeContent: boolean('notifications_include_content').default(false),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  providerId: text('provider_id').notNull(),
  accountId: text('account_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  identifier: text('identifier').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ── BetterAuth plugin tables ──

export const twoFactor = pgTable('two_factor', {
  id: text('id').primaryKey(),
  secret: text('secret').notNull(),
  backupCodes: text('backup_codes').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
}, (table) => [
  index('two_factor_user_id_idx').on(table.userId),
]);

export const passkey = pgTable('passkey', {
  id: text('id').primaryKey(),
  name: text('name'),
  publicKey: text('public_key').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  credentialID: text('credential_id').notNull(),
  counter: integer('counter').notNull(),
  deviceType: text('device_type').notNull(),
  backedUp: boolean('backed_up').notNull(),
  transports: text('transports'),
  createdAt: timestamp('created_at').defaultNow(),
  aaguid: text('aaguid'),
}, (table) => [
  index('passkey_user_id_idx').on(table.userId),
  index('passkey_credential_id_idx').on(table.credentialID),
]);

// ── Custom tables ──

export const mychartInstances = pgTable('mychart_instances', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  hostname: text('hostname').notNull(),
  username: text('username').notNull(),
  encryptedPassword: text('encrypted_password').notNull(),
  encryptedTotpSecret: text('encrypted_totp_secret'),
  mychartEmail: text('mychart_email'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  notificationsLastCheckedAt: timestamp('notifications_last_checked_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('mychart_instances_user_hostname_username_idx').on(table.userId, table.hostname, table.username),
]);
