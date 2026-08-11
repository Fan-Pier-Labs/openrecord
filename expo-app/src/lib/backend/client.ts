import Constants from "expo-constants";
import { getFreshIdToken } from "./google-signin";

function getBackendUrl(): string {
  const url = (Constants.expoConfig?.extra as { backendUrl?: string } | undefined)?.backendUrl;
  if (!url) throw new Error("backendUrl not configured in app.config.ts");
  return url.replace(/\/$/, "");
}

export function backendUrl(path = ""): string {
  return `${getBackendUrl()}${path}`;
}

/**
 * Fetch against the AI Lambda with the user's Google ID token attached.
 * The Lambda verifies the token server-side; requests without one only get
 * the unauthenticated (demo) tier.
 */
export async function backendFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getFreshIdToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(backendUrl(path), { credentials: "omit", ...init, headers });
}
