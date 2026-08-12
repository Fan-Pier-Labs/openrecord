import { useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import {
  getMyChartAccounts,
  removeMyChartAccount,
  getAiProvider,
  type StoredMyChartAccount,
  type AiProvider,
} from "@/lib/storage/secure-store";
import { deleteMemoryForAccount } from "@/lib/storage/database";
import { getBackendSession, type BackendUser } from "@/lib/backend/session";
import { signInWithGoogle, signOutFromGoogle } from "@/lib/backend/google-signin";
import { backendFetch } from "@/lib/backend/client";
import { executeAccountCapability } from "@/lib/scrapers/session-manager";

export default function SettingsScreen() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<StoredMyChartAccount[]>([]);
  const [aiProvider, setAiProviderState] = useState<AiProvider>("free");
  const [backendUser, setBackendUser] = useState<BackendUser | null>(null);
  const [spend, setSpend] = useState<{ spentCents: number; limitCents: number } | null>(null);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [newHostname, setNewHostname] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  // Which account has a sign-in change in flight, so its row disables.
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadSettings();
    }, [])
  );

  async function loadSettings() {
    const accts = await getMyChartAccounts();
    setAccounts(accts);

    setAiProviderState(await getAiProvider());

    const session = await getBackendSession();
    setBackendUser(session?.user ?? null);
    if (session) {
      try {
        // GET on the AI Lambda returns the month's metered spend for the
        // verified Google account.
        const res = await backendFetch("");
        if (res.ok) {
          const data = await res.json();
          setSpend({ spentCents: data.spentCents, limitCents: data.limitCents });
        }
      } catch {
        // ignore
      }
    } else {
      setSpend(null);
    }
  }

  async function handleGoogleSignIn() {
    try {
      await signInWithGoogle();
      await loadSettings();
    } catch (err) {
      Alert.alert("Sign-in failed", (err as Error).message);
    }
  }

  async function handleSignOut() {
    await signOutFromGoogle();
    await loadSettings();
  }

  async function handleDeleteAccount(account: StoredMyChartAccount) {
    Alert.alert(
      "Remove Account",
      `Remove ${account.hostname}? This will delete stored credentials and passkeys.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await removeMyChartAccount(account.id);
            await deleteMemoryForAccount(account.id);
            await loadSettings();
          },
        },
      ]
    );
  }

  /**
   * Run one of the `account`-kind capabilities (`shared/capabilities.ts`).
   *
   * These change how the patient signs in to MyChart, so they are never
   * offered to the model — the CLI drives them from flags and the app drives
   * them from here. Every one is confirmed first and its outcome reported.
   */
  async function runAccountCapability(
    account: StoredMyChartAccount,
    capabilityId: string,
    prompt: { title: string; body: string; confirm: string; destructive?: boolean },
  ) {
    Alert.alert(prompt.title, prompt.body, [
      { text: "Cancel", style: "cancel" },
      {
        text: prompt.confirm,
        style: prompt.destructive ? "destructive" : "default",
        onPress: async () => {
          setBusyAccountId(account.id);
          try {
            const result = await executeAccountCapability(account.id, capabilityId);
            await loadSettings();
            Alert.alert(prompt.title, describeAccountResult(capabilityId, result));
          } catch (err) {
            Alert.alert(prompt.title, (err as Error).message);
          } finally {
            setBusyAccountId(null);
          }
        },
      },
    ]);
  }

  async function handleAddAccount() {
    if (!newHostname || !newUsername || !newPassword) {
      Alert.alert("Error", "All fields are required.");
      return;
    }

    const { addMyChartAccount } = await import("@/lib/storage/secure-store");
    await addMyChartAccount({
      hostname: newHostname.trim(),
      username: newUsername.trim(),
      password: newPassword,
    });

    setNewHostname("");
    setNewUsername("");
    setNewPassword("");
    setShowAddAccount(false);
    await loadSettings();

    // TODO: Trigger login + 2FA + passkey setup flow
    Alert.alert("Account Added", "Connect to this account from the chat screen to set up passkey authentication.");
  }

  const providerLabel: Record<AiProvider, string> = {
    free: "Free tier",
    openai: "OpenAI",
    anthropic: "Anthropic",
    gemini: "Gemini",
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll}>
        <View style={styles.header}>
          <Pressable
            testID="settings-back"
            accessibilityLabel="Back"
            accessibilityRole="button"
            onPress={() => router.back()}
            hitSlop={10}
          >
            <Text style={styles.back}>‹ Back</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={styles.backSpacer} />
        </View>

        {/* Account */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          {backendUser ? (
            <>
              <Text style={styles.label}>Signed in as</Text>
              <Text style={styles.accountHostname}>{backendUser.email}</Text>
              {spend ? (
                <Text style={[styles.securityNote, { marginTop: 8 }]}>
                  AI credit used this month: ${(spend.spentCents / 100).toFixed(2)} of $
                  {(spend.limitCents / 100).toFixed(2)}
                </Text>
              ) : null}
              <Pressable
                testID="google-sign-out"
                style={[styles.saveButton, { backgroundColor: "#d32f2f", marginTop: 12 }]}
                onPress={handleSignOut}
              >
                <Text style={styles.saveButtonText}>Sign out</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.securityNote}>
                Sign in with Google to use AI and get $50 / month of included
                credit.
              </Text>
              <Pressable
                testID="google-sign-in"
                style={[styles.saveButton, { marginTop: 12 }]}
                onPress={handleGoogleSignIn}
              >
                <Text style={styles.saveButtonText}>Continue with Google</Text>
              </Pressable>
            </>
          )}
        </View>

        {/* MyChart Accounts */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MyChart Accounts</Text>

          {accounts.length === 0 && !showAddAccount && (
            <Text style={styles.emptyText}>No accounts added yet.</Text>
          )}

          {accounts.map((account) => (
            <View key={account.id} style={styles.accountBlock}>
              <View style={styles.accountRow}>
                <View style={styles.accountInfo}>
                  <Text style={styles.accountHostname}>{account.hostname}</Text>
                  <Text style={styles.accountUsername}>{account.username}</Text>
                  <View style={styles.accountBadges}>
                    {account.passkeyCredential && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>Passkey</Text>
                      </View>
                    )}
                    {account.totpSecret && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>TOTP</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Pressable
                  testID={`remove-account-${account.id}`}
                  accessibilityLabel={`Remove ${account.hostname}`}
                  onPress={() => handleDeleteAccount(account)}
                >
                  <Text style={styles.deleteText}>Remove</Text>
                </Pressable>
              </View>

              {/*
                The `account`-kind capabilities. Same operations the CLI
                exposes as --set-up-passkey / --list-passkeys /
                --delete-passkey / --set-up-totp / --disable-totp, so the app
                is not the client that can't manage its own sign-in.
              */}
              <View style={styles.accountActions}>
                <Pressable
                  testID={`register-passkey-${account.id}`}
                  accessibilityLabel={`Register a passkey for ${account.hostname}`}
                  disabled={busyAccountId === account.id}
                  onPress={() =>
                    runAccountCapability(account, "register_passkey", {
                      title: "Register passkey",
                      body: `Register a passkey on ${account.hostname} so future logins skip the password and the 2FA code.`,
                      confirm: "Register",
                    })
                  }
                >
                  <Text style={styles.accountActionText}>
                    {account.passkeyCredential ? "Re-register passkey" : "Register passkey"}
                  </Text>
                </Pressable>

                <Pressable
                  testID={`list-passkeys-${account.id}`}
                  accessibilityLabel={`List passkeys for ${account.hostname}`}
                  disabled={busyAccountId === account.id}
                  onPress={() =>
                    runAccountCapability(account, "list_passkeys", {
                      title: "Passkeys",
                      body: `List the passkeys registered on ${account.hostname}.`,
                      confirm: "List",
                    })
                  }
                >
                  <Text style={styles.accountActionText}>List passkeys</Text>
                </Pressable>

                {account.passkeyCredential && (
                  <Pressable
                    testID={`delete-passkeys-${account.id}`}
                    accessibilityLabel={`Delete passkeys for ${account.hostname}`}
                    disabled={busyAccountId === account.id}
                    onPress={() =>
                      runAccountCapability(account, "delete_passkey", {
                        title: "Delete passkeys",
                        body: `Delete every passkey registered on ${account.hostname}? Sign-in will fall back to the password and a 2FA code.`,
                        confirm: "Delete",
                        destructive: true,
                      })
                    }
                  >
                    <Text style={styles.accountActionDanger}>Delete passkeys</Text>
                  </Pressable>
                )}

                {account.totpSecret ? (
                  <Pressable
                    testID={`disable-totp-${account.id}`}
                    accessibilityLabel={`Turn off the authenticator app for ${account.hostname}`}
                    disabled={busyAccountId === account.id}
                    onPress={() =>
                      runAccountCapability(account, "disable_totp", {
                        title: "Turn off authenticator app",
                        body: `Turn off authenticator-app two-factor authentication on ${account.hostname}?`,
                        confirm: "Turn off",
                        destructive: true,
                      })
                    }
                  >
                    <Text style={styles.accountActionDanger}>Turn off authenticator app</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    testID={`setup-totp-${account.id}`}
                    accessibilityLabel={`Set up an authenticator app for ${account.hostname}`}
                    disabled={busyAccountId === account.id}
                    onPress={() =>
                      runAccountCapability(account, "setup_totp", {
                        title: "Set up authenticator app",
                        body: `Turn on authenticator-app two-factor authentication for ${account.hostname}. The code is generated on this device, so sign-in stops waiting on an emailed one.`,
                        confirm: "Set up",
                      })
                    }
                  >
                    <Text style={styles.accountActionText}>Set up authenticator app</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ))}

          {showAddAccount ? (
            <View style={styles.addForm}>
              <TextInput
                testID="add-account-hostname"
                accessibilityLabel="MyChart hostname"
                style={styles.input}
                placeholder="mychart.example.org"
                placeholderTextColor="#999"
                value={newHostname}
                onChangeText={setNewHostname}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TextInput
                testID="add-account-username"
                accessibilityLabel="MyChart username"
                style={styles.input}
                placeholder="Username"
                placeholderTextColor="#999"
                value={newUsername}
                onChangeText={setNewUsername}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TextInput
                testID="add-account-password"
                accessibilityLabel="MyChart password"
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#999"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
              />
              <View style={styles.addFormButtons}>
                <Pressable
                  testID="add-account-cancel"
                  accessibilityLabel="Cancel adding account"
                  accessibilityRole="button"
                  style={styles.cancelButton}
                  onPress={() => setShowAddAccount(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  testID="add-account-save"
                  accessibilityLabel="Add account"
                  accessibilityRole="button"
                  style={styles.saveButton}
                  onPress={handleAddAccount}
                >
                  <Text style={styles.saveButtonText}>Add Account</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              testID="add-account"
              accessibilityLabel="Add MyChart account"
              accessibilityRole="button"
              style={styles.addButton}
              onPress={() => setShowAddAccount(true)}
            >
              <Text style={styles.addButtonText}>+ Add MyChart Account</Text>
            </Pressable>
          )}
        </View>

        {/* AI Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI</Text>
          <Pressable
            testID="settings-ai-provider"
            accessibilityLabel="AI provider settings"
            accessibilityRole="button"
            style={styles.navRow}
            onPress={() => router.push("/settings/ai")}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.navTitle}>AI Provider</Text>
              <Text style={styles.navSubtitle}>{providerLabel[aiProvider]}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </View>

        {/* Security */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security</Text>
          <Text style={styles.securityNote}>
            All MyChart credentials and health data are stored locally in the
            iOS Keychain. On the free tier, AI prompts pass through our server
            so your included credit can be tracked. With your own API key,
            calls go directly to the provider.
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  scroll: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#000" },
  back: { fontSize: 15, color: "#007AFF", fontWeight: "500", minWidth: 60 },
  backSpacer: { minWidth: 60 },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#000", marginBottom: 12 },
  emptyText: { fontSize: 14, color: "#999", marginBottom: 8 },
  accountBlock: {
    borderBottomWidth: 1,
    borderBottomColor: "#f5f5f5",
    paddingBottom: 10,
  },
  accountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },
  accountActions: { gap: 8, paddingLeft: 2 },
  accountActionText: { fontSize: 14, color: "#007AFF" },
  accountActionDanger: { fontSize: 14, color: "#d32f2f" },
  accountInfo: { flex: 1 },
  accountHostname: { fontSize: 15, fontWeight: "500", color: "#1a1a1a" },
  accountUsername: { fontSize: 13, color: "#666", marginTop: 2 },
  accountBadges: { flexDirection: "row", marginTop: 4, gap: 6 },
  badge: {
    backgroundColor: "#e8f5e9",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 11, color: "#2e7d32", fontWeight: "500" },
  deleteText: { fontSize: 14, color: "#d32f2f" },
  addButton: { paddingVertical: 12 },
  addButtonText: { fontSize: 15, color: "#007AFF", fontWeight: "500" },
  addForm: { marginTop: 8, gap: 8 },
  input: {
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  addFormButtons: { flexDirection: "row", gap: 8, marginTop: 4 },
  cancelButton: {
    flex: 1,
    backgroundColor: "#f0f0f0",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelButtonText: { fontSize: 15, color: "#666", fontWeight: "500" },
  saveButton: {
    flex: 1,
    backgroundColor: "#000",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 8,
  },
  saveButtonText: { fontSize: 15, color: "#fff", fontWeight: "600" },
  label: { fontSize: 14, color: "#666", marginBottom: 6 },
  apiKeyRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  eyeButton: { padding: 8 },
  modelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  modelRowSelected: { backgroundColor: "#f0f0f0" },
  modelText: { fontSize: 14, color: "#1a1a1a" },
  modelTextSelected: { fontWeight: "600" },
  checkmark: { fontSize: 16, color: "#007AFF" },
  securityNote: { fontSize: 14, color: "#666", lineHeight: 20 },
  navRow: { flexDirection: "row", alignItems: "center", paddingVertical: 4 },
  navTitle: { fontSize: 15, fontWeight: "500", color: "#1a1a1a" },
  navSubtitle: { fontSize: 13, color: "#666", marginTop: 2 },
  chevron: { fontSize: 22, color: "#999" },
});

/**
 * Turn an account-capability result into a sentence for the confirmation
 * alert. Each capability returns a different shape, and "{"registered":true}"
 * is not an answer to "did it work?".
 */
function describeAccountResult(capabilityId: string, result: unknown): string {
  const value = (result ?? {}) as Record<string, unknown>;
  switch (capabilityId) {
    case "register_passkey":
      return "Passkey registered. Future sign-ins on this device skip the password and the 2FA code.";
    case "list_passkeys": {
      const passkeys = (value.passkeys as Array<{ name?: string; createdOnDevice?: string }>) ?? [];
      if (passkeys.length === 0) return "No passkeys are registered on this account.";
      return passkeys
        .map((p) => `• ${p.name || "Unnamed"}${p.createdOnDevice ? ` — ${p.createdOnDevice}` : ""}`)
        .join("\n");
    }
    case "delete_passkey": {
      const deleted = (value.deleted as string[]) ?? [];
      const failed = (value.failed as string[]) ?? [];
      const head = `Deleted ${deleted.length} passkey${deleted.length === 1 ? "" : "s"}.`;
      return failed.length ? `${head} ${failed.length} could not be deleted.` : head;
    }
    case "setup_totp":
      return "Authenticator app enabled. This device now generates its own 2FA codes.";
    case "disable_totp":
      return "Authenticator app turned off. MyChart will email a code on the next sign-in.";
    default:
      return JSON.stringify(result, null, 2);
  }
}
