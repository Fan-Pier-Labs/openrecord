import { betterAuth } from 'better-auth';
import { getBetterAuthSecret, getGoogleOAuthCredentials, hasGoogleOAuth } from './mcp/config';
import { getSharedPool, onPoolRecreated, isAuthError, resetPool } from './db-pool';
import { nextCookies } from 'better-auth/next-js';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { magicLink } from 'better-auth/plugins/magic-link';
import { bearer } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';
import { sendEmail } from './email';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let authInstance: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let authPromise: Promise<any> | null = null;

// Drop the cached auth instance so the next getAuth() call rebuilds it
// against the freshly-rebuilt pool. The pool reference is baked into
// BetterAuth's database adapter at construction time, so we have to
// rebuild the whole thing — there's no public hook to swap the pool in
// place.
onPoolRecreated(() => {
  authInstance = null;
  authPromise = null;
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildAuth(): Promise<any> {
  const pool = await getSharedPool();
  console.log('[Auth] Loading secrets...');

  const useGoogle = hasGoogleOAuth();
  const [secret, googleOAuth] = await Promise.all([
    getBetterAuthSecret(),
    useGoogle ? getGoogleOAuthCredentials() : Promise.resolve(null),
  ]);
  // RAILWAY_PUBLIC_DOMAIN is a reference variable (not auto-injected); use it when available.
  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : undefined;
  const baseURL = process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_BASE_URL || railwayDomain || `http://localhost:${process.env.PORT || 3000}`;
  if (useGoogle && googleOAuth) {
    console.log('[Auth] Secrets loaded. Google clientId:', googleOAuth.clientId.slice(0, 20) + '...', 'baseURL:', baseURL);
  } else {
    console.log('[Auth] Secrets loaded. Google OAuth: disabled. baseURL:', baseURL);
  }

  // Build trusted origins list. Wildcards supported by BetterAuth.
  const trustedOrigins = [
    'http://localhost:2343',
    'http://localhost:3000',
    // Trust all Railway-provided subdomains so any deployment works without extra config.
    'https://*.up.railway.app',
    // iOS app custom scheme (expo-app)
    'openrecord://',
    // AWS Fargate prod domain + legacy redirect source. BETTER_AUTH_URL is not set in the task env.
    'https://openrecord.fanpierlabs.com',
    'https://mychart.fanpierlabs.com',
  ];
  if (baseURL && !trustedOrigins.includes(baseURL)) {
    trustedOrigins.push(baseURL);
  }
  // Allow additional trusted origins via env var (comma-separated)
  if (process.env.TRUSTED_ORIGINS) {
    for (const origin of process.env.TRUSTED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)) {
      if (!trustedOrigins.includes(origin)) {
        trustedOrigins.push(origin);
      }
    }
  }

  authInstance = betterAuth({
    database: pool,
    baseURL,
    trustedOrigins,
    secret,
    rateLimit: process.env.DISABLE_RATE_LIMIT === 'true' ? { enabled: false } : undefined,
    emailAndPassword: {
      enabled: true,
      async sendResetPassword({ user, url }) {
        void sendEmail({
          to: user.email,
          subject: 'Reset your password',
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
              <h2 style="color: #1a1a24; font-size: 24px; font-weight: 600; margin-bottom: 16px;">Reset your password</h2>
              <p style="color: #5a5a6a; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
                We received a request to reset the password for your OpenRecord account. Click the button below to choose a new password.
              </p>
              <a href="${url}" style="display: inline-block; background: #1a1a24; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-size: 14px; font-weight: 500;">
                Reset Password
              </a>
              <p style="color: #9ca3af; font-size: 13px; line-height: 1.5; margin-top: 32px;">
                If you didn't request this, you can safely ignore this email. This link will expire shortly.
              </p>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0 16px;" />
              <p style="color: #9ca3af; font-size: 12px;">OpenRecord</p>
            </div>
          `,
        });
      },
    },
    ...(useGoogle && googleOAuth
      ? {
          socialProviders: {
            google: {
              clientId: googleOAuth.clientId,
              clientSecret: googleOAuth.clientSecret,
            },
          },
        }
      : {}),
    plugins: [
      bearer(),
      nextCookies(),
      twoFactor({
        issuer: 'MyChart MCP',
      }),
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await sendEmail({
            to: email,
            subject: 'Sign in to MyChart Connector',
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
                <h2 style="font-size: 24px; font-weight: 600; color: #1a1a24; margin-bottom: 8px;">Sign in to MyChart Connector</h2>
                <p style="color: #5a5a6a; font-size: 16px; line-height: 1.5; margin-bottom: 32px;">Click the button below to sign in. This link expires in 10 minutes.</p>
                <a href="${url}" style="display: inline-block; padding: 14px 32px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 9999px; font-weight: 500; font-size: 16px;">Sign in</a>
                <p style="color: #94a3b8; font-size: 13px; margin-top: 32px;">If you didn't request this email, you can safely ignore it.</p>
              </div>
            `,
          });
        },
      }),
      passkey({
        rpID: new URL(baseURL).hostname,
        rpName: 'MyChart MCP',
        origin: baseURL,
      }),
    ],
  });

  return authInstance;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getAuth(): Promise<any> {
  if (authInstance) return authInstance;
  if (!authPromise) authPromise = buildAuth();
  return authPromise;
}

/**
 * Run a BetterAuth API call with auth-error retry. BetterAuth wraps the
 * underlying pg error in its own APIError and surfaces it as
 * INTERNAL_SERVER_ERROR / FAILED_TO_GET_SESSION, so we have to sniff
 * both the wrapped error and any nested cause to detect an RDS
 * rotation. On match we drop the cached auth + pool and retry once.
 */
export async function withAuthApiRetry<T>(fn: (auth: Awaited<ReturnType<typeof getAuth>>) => Promise<T>): Promise<T> {
  try {
    return await fn(await getAuth());
  } catch (err) {
    if (!isAuthErrorDeep(err)) throw err;
    console.warn('[Auth] BetterAuth surfaced a DB auth error — refreshing and retrying');
    await resetPool();
    return await fn(await getAuth());
  }
}

function isAuthErrorDeep(err: unknown): boolean {
  if (isAuthError(err)) return true;
  const e = err as { cause?: unknown; body?: { message?: string; code?: string } };
  if (e?.cause && isAuthErrorDeep(e.cause)) return true;
  if (e?.body) {
    const msg = e.body.message ?? '';
    const code = e.body.code ?? '';
    if (code === 'FAILED_TO_GET_SESSION' && msg.toLowerCase().includes('session')) {
      // BetterAuth's generic FAILED_TO_GET_SESSION mostly comes from a DB
      // failure. Treat it as a possible auth error and let the single
      // retry sort it out — if the retry also fails, the original error
      // propagates unchanged.
      return true;
    }
  }
  return false;
}
