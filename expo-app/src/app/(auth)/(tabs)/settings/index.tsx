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
import { useFocusEffect } from "expo-router";
import {
  getMyChartAccounts,
  removeMyChartAccount,
  getClaudeApiKey,
  setClaudeApiKey,
  getSelectedModel,
  setSelectedModel,
  type StoredMyChartAccount,
} from "@/lib/storage/secure-store";
import {
  getBackendSession,
  clearBackendSession,
  type BackendUser,
} from "@/lib/backend/session";
import { signInWithGoogle, signOutFromGoogle } from "@/lib/backend/google-signin";
import { backendFetch } from "@/lib/backend/client";

export default function SettingsScreen() {
  const [accounts, setAccounts] = useState<StoredMyChartAccount[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [backendUser, setBackendUser] = useState<BackendUser | null>(null);
  const [spend, setSpend] = useState<{ spentCents: number; limitCents: number } | null>(null);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [newHostname, setNewHostname] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");

  useFocusEffect(
    useCallback(() => {
      loadSettings();
    }, [])
  );

  async function loadSettings() {
    const accts = await getMyChartAccounts();
    setAccounts(accts);

    const key = await getClaudeApiKey();
    setApiKey(key || "");

    const m = await getSelectedModel();
    setModel(m);

    const session = await getBackendSession();
    setBackendUser(session?.user ?? null);
    if (session) {
      try {
        const res = await backendFetch("/api/ai");
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
    await clearBackendSession();
    await loadSettings();
  }

  async function handleSaveApiKey() {
    await setClaudeApiKey(apiKey);
    Alert.alert("Saved", "API key updated.");
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
            await loadSettings();
          },
        },
      ]
    );
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

  async function handleModelChange(newModel: string) {
    setModel(newModel);
    await setSelectedModel(newModel);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Settings</Text>
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
              <Pressable style={[styles.saveButton, { backgroundColor: "#d32f2f", marginTop: 12 }]} onPress={handleSignOut}>
                <Text style={styles.saveButtonText}>Sign out</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.securityNote}>
                Sign in with Google to get $50 / month of included AI credit.
              </Text>
              <Pressable style={[styles.saveButton, { marginTop: 12 }]} onPress={handleGoogleSignIn}>
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
            <View key={account.id} style={styles.accountRow}>
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
              <Pressable onPress={() => handleDeleteAccount(account)}>
                <Text style={styles.deleteText}>Remove</Text>
              </Pressable>
            </View>
          ))}

          {showAddAccount ? (
            <View style={styles.addForm}>
              <TextInput
                style={styles.input}
                placeholder="mychart.example.org"
                placeholderTextColor="#999"
                value={newHostname}
                onChangeText={setNewHostname}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TextInput
                style={styles.input}
                placeholder="Username"
                placeholderTextColor="#999"
                value={newUsername}
                onChangeText={setNewUsername}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#999"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
              />
              <View style={styles.addFormButtons}>
                <Pressable
                  style={styles.cancelButton}
                  onPress={() => setShowAddAccount(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.saveButton} onPress={handleAddAccount}>
                  <Text style={styles.saveButtonText}>Add Account</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              style={styles.addButton}
              onPress={() => setShowAddAccount(true)}
            >
              <Text style={styles.addButtonText}>+ Add MyChart Account</Text>
            </Pressable>
          )}
        </View>

        {/* AI Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI Settings</Text>

          {showApiKey ? (
            <>
              <Text style={styles.label}>Anthropic API Key (advanced)</Text>
              <Text style={[styles.securityNote, { marginBottom: 8 }]}>
                Optional. Overrides the included credit and sends AI calls
                directly to Anthropic using your own key.
              </Text>
              <View style={styles.apiKeyRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="sk-ant-..."
                  placeholderTextColor="#999"
                  value={apiKey}
                  onChangeText={setApiKey}
                  secureTextEntry={!apiKeyVisible}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Pressable
                  style={styles.eyeButton}
                  onPress={() => setApiKeyVisible(!apiKeyVisible)}
                >
                  <Text>{apiKeyVisible ? "Hide" : "Show"}</Text>
                </Pressable>
              </View>
              <Pressable style={styles.saveButton} onPress={handleSaveApiKey}>
                <Text style={styles.saveButtonText}>Save API Key</Text>
              </Pressable>
            </>
          ) : (
            <Pressable onPress={() => setShowApiKey(true)}>
              <Text style={styles.addButtonText}>Use my own Anthropic API key</Text>
            </Pressable>
          )}

          <Text style={[styles.label, { marginTop: 16 }]}>Model</Text>
          {["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5-20251001"].map((m) => (
            <Pressable
              key={m}
              style={[styles.modelRow, model === m && styles.modelRowSelected]}
              onPress={() => handleModelChange(m)}
            >
              <Text style={[styles.modelText, model === m && styles.modelTextSelected]}>
                {m}
              </Text>
              {model === m && <Text style={styles.checkmark}>✓</Text>}
            </Pressable>
          ))}
        </View>

        {/* Security */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security</Text>
          <Text style={styles.securityNote}>
            All MyChart credentials and health data are stored locally in the
            iOS Keychain. When signed in with Google, AI prompts (but not your
            MyChart data) pass through our server so credit can be tracked.
            With your own Anthropic API key, calls go directly to Anthropic.
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#000" },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#000", marginBottom: 12 },
  emptyText: { fontSize: 14, color: "#999", marginBottom: 8 },
  accountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f5f5f5",
  },
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
});
