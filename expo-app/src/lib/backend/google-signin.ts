import Constants from "expo-constants";
import { GoogleSignin, statusCodes } from "@react-native-google-signin/google-signin";
import {
  getBackendSession,
  setBackendSession,
  clearBackendSession,
  type BackendUser,
} from "./session";

let configured = false;

function configure() {
  if (configured) return;
  const extra = Constants.expoConfig?.extra as
    | { googleWebClientId?: string; googleIosClientId?: string }
    | undefined;
  const webClientId = extra?.googleWebClientId;
  const iosClientId = extra?.googleIosClientId;
  if (!webClientId) {
    throw new Error(
      "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not set — cannot sign in with Google.",
    );
  }
  GoogleSignin.configure({
    webClientId,
    iosClientId,
    // Ask for an ID token so the AI Lambda can verify the Google identity.
    offlineAccess: false,
  });
  configured = true;
}

type IdTokenClaims = {
  sub?: string;
  email?: string;
  name?: string;
  exp?: number;
};

function decodeClaims(idToken: string): IdTokenClaims {
  try {
    const payload = idToken.split(".")[1] ?? "";
    const json = globalThis.atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as IdTokenClaims;
  } catch {
    return {};
  }
}

async function storeSessionFromToken(idToken: string): Promise<BackendUser> {
  const claims = decodeClaims(idToken);
  if (!claims.sub || !claims.email) {
    throw new Error("Google sign-in returned an unusable ID token.");
  }
  const user: BackendUser = { id: claims.sub, email: claims.email, name: claims.name };
  await setBackendSession({ idToken, user });
  return user;
}

/**
 * Open the native Google sign-in sheet and persist the resulting ID token.
 * The token itself is what the AI Lambda verifies — there is no separate
 * backend session to establish.
 */
export async function signInWithGoogle(): Promise<BackendUser> {
  configure();

  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result = await GoogleSignin.signIn();

  // google-signin v13 wraps the payload in { type, data }.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the `?? result` fallback deliberately accepts both the pre-v13 shape (the user object directly) and the v13 wrapper, and no single declared type covers both; the idToken read below is guarded at runtime instead
  const payload: any = (result as any).data ?? result;
  const idToken: string | undefined = payload?.idToken;
  if (!idToken) {
    throw new Error("Google sign-in did not return an ID token.");
  }
  return storeSessionFromToken(idToken);
}

/**
 * Return a Google ID token that is still valid for at least a minute,
 * silently re-signing-in to refresh an expired one (Google ID tokens live
 * ~1 hour). Returns null when there is no session or the silent refresh
 * fails — the caller should send the user back to sign-in.
 */
export async function getFreshIdToken(): Promise<string | null> {
  const session = await getBackendSession();
  if (!session) return null;

  const exp = decodeClaims(session.idToken).exp ?? 0;
  if (exp * 1000 > Date.now() + 60_000) return session.idToken;

  try {
    configure();
    const result = await GoogleSignin.signInSilently();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- signInSilently returns the same dual shape as signInWithGoogle above, and is unwrapped the same way
    const payload: any = (result as any).data ?? result;
    const idToken: string | undefined = payload?.idToken;
    if (!idToken) return null;
    await storeSessionFromToken(idToken);
    return idToken;
  } catch {
    return null;
  }
}

export async function signOutFromGoogle(): Promise<void> {
  try {
    await GoogleSignin.signOut();
  } catch {
    // ignore
  }
  await clearBackendSession();
}

export { statusCodes as googleStatusCodes };
