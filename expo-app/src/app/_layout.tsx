import { useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { Slot, useRouter, useSegments } from "expo-router";
import { fireAndForget } from "@/lib/fire-and-forget";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "@/lib/auth/auth-context";
import { initDatabase } from "@/lib/storage/database";
import { initInstances } from "@/lib/mychart-instances";
import { getMyChartAccounts } from "@/lib/storage/secure-store";

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h per account

function RootLayoutNav() {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const lastRefreshAt = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!isAuthenticated && inAuthGroup) {
      router.replace("/onboarding");
    } else if (isAuthenticated && !inAuthGroup) {
      router.replace("/(auth)");
    }
  }, [isAuthenticated, segments, isLoading]);

  // Background memory refresh on app foreground. Debounced per-account
  // to once every REFRESH_INTERVAL_MS so we don't hammer scrapers or AI.
  useEffect(() => {
    if (!isAuthenticated) return;

    async function maybeRefreshAll() {
      try {
        const accounts = await getMyChartAccounts();
        if (accounts.length === 0) return;
        const now = Date.now();
        const due = accounts.filter((a) => {
          const last = lastRefreshAt.current.get(a.id) ?? 0;
          return now - last >= REFRESH_INTERVAL_MS;
        });
        if (due.length === 0) return;
        // eslint-disable-next-line no-restricted-syntax -- deliberate cold-start deferral: keeps the AI client + memory module out of the initial bundle path
        const { refreshMemory } = await import("@/lib/memory/builder");
        for (const a of due) {
          lastRefreshAt.current.set(a.id, now);
          refreshMemory(a.id).catch((err: unknown) =>
            console.warn(
              `[memory] refresh failed for ${a.id}:`,
              err instanceof Error ? err.message : err,
            ),
          );
        }
      } catch (err) {
        console.warn("[memory] foreground refresh dispatch failed:", (err as Error).message);
      }
    }

    // Run once on mount (covers cold start) and on every transition to active.
    fireAndForget(maybeRefreshAll(), "memory:refresh");
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") fireAndForget(maybeRefreshAll(), "memory:refresh");
    });
    return () => sub.remove();
  }, [isAuthenticated]);

  return (
    <>
      <StatusBar style="dark" />
      <Slot />
    </>
  );
}

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    // A failed init would otherwise leave the app stuck on the null screen
    // with no trace of why.
    initDatabase()
      .then(() => {
        setDbReady(true);
        // Cached list first, then a background refresh from Epic's directory
        // if it's stale. Not awaited: the picker always has the bundled seed,
        // so nothing here should hold up the first screen.
        fireAndForget(initInstances(), "instances:init");
      })
      .catch((err: unknown) => console.error("[db] initDatabase failed:", err));
  }, []);

  if (!dbReady) return null;

  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
