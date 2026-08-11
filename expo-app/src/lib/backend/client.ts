import Constants from "expo-constants";

function getBackendUrl(): string {
  const url = (Constants.expoConfig?.extra as { backendUrl?: string } | undefined)?.backendUrl;
  if (!url) throw new Error("backendUrl not configured in app.config.ts");
  return url.replace(/\/$/, "");
}

export function backendUrl(path = ""): string {
  return `${getBackendUrl()}${path}`;
}
