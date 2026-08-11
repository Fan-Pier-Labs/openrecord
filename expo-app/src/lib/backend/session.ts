import { getSecureValue, setSecureValue, deleteSecureValue } from "@/lib/storage/secure-store";

const TOKEN_KEY = "google_id_token";
const USER_KEY = "backend_user";

export type BackendUser = {
  /** Google's stable account id (the ID token's `sub` claim). */
  id: string;
  email: string;
  name?: string;
};

export type BackendSession = {
  /** The Google ID token — a JWT the AI Lambda verifies server-side. */
  idToken: string;
  user: BackendUser;
};

export async function getBackendSession(): Promise<BackendSession | null> {
  const [idToken, userRaw] = await Promise.all([
    getSecureValue(TOKEN_KEY),
    getSecureValue(USER_KEY),
  ]);
  if (!idToken || !userRaw) return null;
  try {
    return { idToken, user: JSON.parse(userRaw) as BackendUser };
  } catch {
    return null;
  }
}

export async function setBackendSession(session: BackendSession): Promise<void> {
  await Promise.all([
    setSecureValue(TOKEN_KEY, session.idToken),
    setSecureValue(USER_KEY, JSON.stringify(session.user)),
  ]);
}

export async function clearBackendSession(): Promise<void> {
  await Promise.all([deleteSecureValue(TOKEN_KEY), deleteSecureValue(USER_KEY)]);
}
