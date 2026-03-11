import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// Hardcoded infrastructure config — no env vars needed
const RDS_HOST = 'ryans-side-project.csoofaracapo.us-east-2.rds.amazonaws.com';
const RDS_PORT = 5432;
const RDS_USER = 'postgres';
const RDS_DATABASE = 'mychartscrapers';
const RDS_PASSWORD_SECRET_ARN = 'arn:aws:secretsmanager:us-east-2:555985150976:secret:rds!db-e8257e96-5388-431e-84fe-828624f5ae16-VAxdIu';
const MCP_ENCRYPTION_KEY_SECRET_ARN = 'arn:aws:secretsmanager:us-east-2:555985150976:secret:MCP_ENCRYPTION_KEY-7dAfwd';
const BETTER_AUTH_SECRET_ARN = 'arn:aws:secretsmanager:us-east-2:555985150976:secret:BETTER_AUTH_SECRET-ViBKHZ';
const GOOGLE_OAUTH_SECRET_ARN = 'arn:aws:secretsmanager:us-east-2:555985150976:secret:GOOGLE_OAUTH_CREDENTIALS-XtqYdp';

const AWS_REGION = 'us-east-2';

const client = new SecretsManagerClient({
  region: AWS_REGION,
  // Use fanpierlabs profile for local dev; in Fargate the task role provides creds automatically
  ...(process.env.NODE_ENV === 'development' ? { profile: 'fanpierlabs' } : {}),
});

// Cache resolved secrets in memory
let cachedDbPassword: string | null = null;
let cachedEncryptionKey: string | null = null;
let cachedBetterAuthSecret: string | null = null;
let cachedGoogleOAuth: { clientId: string; clientSecret: string } | null = null;

async function getSecretValue(arn: string): Promise<string> {
  const resp = await client.send(new GetSecretValueCommand({ SecretId: arn }));
  if (!resp.SecretString) throw new Error(`Secret ${arn} has no string value`);
  return resp.SecretString;
}

export async function getRdsPassword(): Promise<string> {
  if (cachedDbPassword) return cachedDbPassword;
  const raw = await getSecretValue(RDS_PASSWORD_SECRET_ARN);
  // RDS-managed secrets are JSON: {"username":"postgres","password":"..."}
  try {
    const parsed = JSON.parse(raw);
    cachedDbPassword = parsed.password;
  } catch {
    cachedDbPassword = raw;
  }
  return cachedDbPassword!;
}

export async function getEncryptionKey(): Promise<string> {
  if (cachedEncryptionKey) return cachedEncryptionKey;
  cachedEncryptionKey = await getSecretValue(MCP_ENCRYPTION_KEY_SECRET_ARN);
  return cachedEncryptionKey;
}

export async function getBetterAuthSecret(): Promise<string> {
  if (cachedBetterAuthSecret) return cachedBetterAuthSecret;
  cachedBetterAuthSecret = await getSecretValue(BETTER_AUTH_SECRET_ARN);
  return cachedBetterAuthSecret;
}

export async function getGoogleOAuthCredentials(): Promise<{ clientId: string; clientSecret: string }> {
  if (cachedGoogleOAuth) return cachedGoogleOAuth;
  const raw = await getSecretValue(GOOGLE_OAUTH_SECRET_ARN);
  const parsed = JSON.parse(raw);
  cachedGoogleOAuth = { clientId: parsed.client_id, clientSecret: parsed.client_secret };
  return cachedGoogleOAuth;
}

export async function getDatabaseUrl(): Promise<string> {
  const password = await getRdsPassword();
  return `postgresql://${RDS_USER}:${encodeURIComponent(password)}@${RDS_HOST}:${RDS_PORT}/${RDS_DATABASE}`;
}
