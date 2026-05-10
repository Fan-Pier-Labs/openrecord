import { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  ScrollView,
  FlatList,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth/auth-context";
import {
  setSecureValue,
  getClaudeApiKey,
  addMyChartAccount,
  type StoredMyChartAccount,
} from "@/lib/storage/secure-store";
import { signInWithGoogle } from "@/lib/backend/google-signin";
import { getBackendSession } from "@/lib/backend/session";
import {
  connectAccount,
  complete2fa,
  registerPasskey,
} from "@/lib/scrapers/session-manager";
import {
  getInstances,
  prefetchInstances,
  hostnameFromInstance,
  searchInstances,
  type MyChartInstance,
} from "@/lib/mychart-instances";

type Step = "welcome" | "google" | "picker" | "mychart" | "twofa" | "passkey";

export default function OnboardingScreen() {
  const { setSetupComplete } = useAuth();
  const [step, setStep] = useState<Step>("welcome");

  // Google
  const [signingIn, setSigningIn] = useState(false);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);

  // Picker
  const [pickerQuery, setPickerQuery] = useState("");
  const [selectedInstance, setSelectedInstance] = useState<MyChartInstance | null>(null);

  // MyChart
  const [hostname, setHostname] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [twoFaCode, setTwoFaCode] = useState("");
  const [twoFaDelivery, setTwoFaDelivery] = useState<string | null>(null);
  const [verifying2fa, setVerifying2fa] = useState(false);

  // Track the connected account so passkey step can target it.
  const accountRef = useRef<StoredMyChartAccount | null>(null);
  const accountIdRef = useRef<string | null>(null);

  // Passkey
  const [registeringPasskey, setRegisteringPasskey] = useState(false);

  // Dev shortcut: BYO Claude key + backend session → straight to chat.
  // Also pre-warm the MyChart instance list + a few logos so the picker
  // is instant when the user gets there.
  useEffect(() => {
    (async () => {
      const [byoKey, session] = await Promise.all([
        getClaudeApiKey(),
        getBackendSession(),
      ]);
      if (session) setSignedInEmail(session.user.email);
      if (__DEV__ && byoKey && session) {
        await setSecureValue("setup_complete", "true");
        setSetupComplete();
        return;
      }
      // Fire-and-forget; failures don't matter — we have bundled data.
      prefetchInstances().catch(() => undefined);
    })();
  }, []);

  const filteredInstances = useMemo(
    () => searchInstances(pickerQuery, getInstances()),
    [pickerQuery],
  );

  function handlePickInstance(instance: MyChartInstance) {
    setSelectedInstance(instance);
    setHostname(hostnameFromInstance(instance));
    setStep("mychart");
  }

  async function handleGoogleSignIn() {
    setSigningIn(true);
    try {
      const user = await signInWithGoogle();
      setSignedInEmail(user.email);
      setStep("picker");
    } catch (err) {
      Alert.alert("Sign-in failed", (err as Error).message);
    } finally {
      setSigningIn(false);
    }
  }

  async function handleConnectMyChart() {
    if (!hostname.trim() || !username.trim() || !password) {
      Alert.alert("Missing info", "Hostname, username, and password are required.");
      return;
    }
    setConnecting(true);
    try {
      const account = await addMyChartAccount({
        hostname: hostname.trim(),
        username: username.trim(),
        password,
      });
      accountRef.current = account;
      accountIdRef.current = account.id;

      const result = await connectAccount(account);
      if (result.state === "logged_in") {
        setStep("passkey");
        return;
      }
      if (result.state === "need_2fa") {
        const delivery = result.twoFaDelivery;
        const label =
          delivery?.contact ??
          (delivery?.method === "sms"
            ? "your phone"
            : delivery?.method === "email"
              ? "your email"
              : "your inbox");
        setTwoFaDelivery(label);
        setStep("twofa");
        return;
      }
      if (result.state === "invalid_login") {
        Alert.alert("Invalid credentials", "Double-check your username and password.");
        return;
      }
      Alert.alert("Could not sign in", result.error ?? "Unknown error.");
    } catch (err) {
      Alert.alert("Connection failed", (err as Error).message);
    } finally {
      setConnecting(false);
    }
  }

  async function handleVerify2fa() {
    const accountId = accountIdRef.current;
    if (!accountId) return;
    if (twoFaCode.trim().length < 4) {
      Alert.alert("Enter your code", "Type the verification code from your inbox or text message.");
      return;
    }
    setVerifying2fa(true);
    try {
      const result = await complete2fa(accountId, twoFaCode.trim());
      if (result.state === "logged_in") {
        setStep("passkey");
        return;
      }
      if (result.state === "invalid_2fa") {
        Alert.alert("Wrong code", "That code didn't match. Try again.");
        return;
      }
      Alert.alert("2FA failed", "Could not verify the code.");
    } catch (err) {
      Alert.alert("2FA failed", (err as Error).message);
    } finally {
      setVerifying2fa(false);
    }
  }

  async function handleRegisterPasskey() {
    const accountId = accountIdRef.current;
    if (!accountId) {
      await finishSetup();
      return;
    }
    setRegisteringPasskey(true);
    try {
      const ok = await registerPasskey(accountId);
      if (!ok) {
        Alert.alert(
          "Passkey setup failed",
          "We couldn't register a passkey on your MyChart account. You can try again later from Settings.",
          [{ text: "Continue", onPress: () => finishSetup() }],
        );
        return;
      }
      await finishSetup();
    } catch (err) {
      Alert.alert("Passkey setup failed", (err as Error).message, [
        { text: "Continue", onPress: () => finishSetup() },
      ]);
    } finally {
      setRegisteringPasskey(false);
    }
  }

  async function handleSkipPasskey() {
    await finishSetup();
  }

  async function finishSetup() {
    await setSecureValue("setup_complete", "true");
    setSetupComplete();
  }

  if (step === "picker") {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <View style={styles.pickerHeader}>
          <Text style={styles.pickerTitle}>Find your provider</Text>
          <Text style={styles.pickerSubtitle}>
            {filteredInstances.length} of {getInstances().length} MyChart sites
          </Text>
        </View>
        <View style={styles.pickerSearchWrap}>
          <TextInput
            testID="picker-search"
            style={styles.pickerSearch}
            placeholder="Search by hospital, system, or city"
            placeholderTextColor="#999"
            value={pickerQuery}
            onChangeText={setPickerQuery}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>
        <FlatList
          data={filteredInstances}
          keyExtractor={(item, index) => `${item.url || ""}|${item.name}|${index}`}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={20}
          windowSize={8}
          contentContainerStyle={styles.pickerListContent}
          ListEmptyComponent={
            <View style={styles.pickerEmpty}>
              <Text style={styles.pickerEmptyText}>
                No MyChart sites match "{pickerQuery}".
              </Text>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => {
                  setSelectedInstance(null);
                  setHostname("");
                  setStep("mychart");
                }}
              >
                <Text style={styles.secondaryButtonText}>Enter hostname manually</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              testID={`picker-item-${item.name}`}
              style={({ pressed }) => [
                styles.pickerRow,
                pressed && styles.pickerRowPressed,
              ]}
              onPress={() => handlePickInstance(item)}
            >
              {item.logoUrl ? (
                <Image
                  source={{ uri: item.logoUrl }}
                  style={styles.pickerLogo}
                  resizeMode="contain"
                />
              ) : (
                <View style={[styles.pickerLogo, styles.pickerLogoFallback]} />
              )}
              <View style={styles.pickerRowText}>
                <Text style={styles.pickerRowName} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.url ? (
                  <Text style={styles.pickerRowHost} numberOfLines={1}>
                    {hostnameFromInstance(item)}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.pickerChevron}>›</Text>
            </Pressable>
          )}
        />
        <View style={styles.pickerFooter}>
          <Pressable
            testID="picker-manual"
            style={styles.secondaryButton}
            onPress={() => {
              setSelectedInstance(null);
              setHostname("");
              setStep("mychart");
            }}
          >
            <Text style={styles.secondaryButtonText}>
              Don't see yours? Enter hostname manually
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {step === "welcome" && (
            <View style={styles.center}>
              <Text style={styles.title}>OpenRecord</Text>
              <Text style={styles.subtitle}>Your health records, in your pocket</Text>
              <Text style={styles.body}>
                Connect your MyChart account, then ask AI anything about your
                health. Everything stays on your device.
              </Text>
              <Pressable
                testID="welcome-get-started"
                style={styles.primaryButton}
                onPress={() => setStep("google")}
              >
                <Text style={styles.primaryButtonText}>Get Started</Text>
              </Pressable>
            </View>
          )}

          {step === "google" && (
            <View style={styles.center}>
              <Text style={styles.title}>Sign in with Google</Text>
              <Text style={styles.body}>
                Get $50 / month of AI credit included — no API key needed. We
                only see your email and name. Your medical data never leaves
                your device.
              </Text>
              {signedInEmail ? (
                <Text style={styles.metaText}>Signed in as {signedInEmail}</Text>
              ) : null}
              <Pressable
                testID="google-continue"
                style={[styles.primaryButton, signingIn && styles.disabled]}
                onPress={signedInEmail ? () => setStep("picker") : handleGoogleSignIn}
                disabled={signingIn}
              >
                {signingIn ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {signedInEmail ? "Continue" : "Continue with Google"}
                  </Text>
                )}
              </Pressable>
            </View>
          )}

          {step === "mychart" && (
            <View style={styles.center}>
              <Text style={styles.title}>Connect MyChart</Text>
              <Text style={styles.body}>
                Sign in to your MyChart account. If your provider asks for a
                2FA code, we'll prompt you next. After that we'll set up a
                passkey so you never need to type this password again.
              </Text>
              {selectedInstance ? (
                <View style={styles.selectedInstance}>
                  {selectedInstance.logoUrl ? (
                    <Image
                      source={{ uri: selectedInstance.logoUrl }}
                      style={styles.selectedInstanceLogo}
                      resizeMode="contain"
                    />
                  ) : null}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectedInstanceName} numberOfLines={1}>
                      {selectedInstance.name}
                    </Text>
                    <Text style={styles.selectedInstanceHost} numberOfLines={1}>
                      {hostname}
                    </Text>
                  </View>
                  <Pressable
                    testID="mychart-change"
                    onPress={() => {
                      setStep("picker");
                    }}
                    disabled={connecting}
                  >
                    <Text style={styles.selectedInstanceChange}>Change</Text>
                  </Pressable>
                </View>
              ) : (
                <TextInput
                  testID="mychart-hostname"
                  style={styles.input}
                  placeholder="mychart.example.org"
                  placeholderTextColor="#999"
                  value={hostname}
                  onChangeText={setHostname}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  editable={!connecting}
                />
              )}
              <TextInput
                testID="mychart-username"
                style={styles.input}
                placeholder="Username"
                placeholderTextColor="#999"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!connecting}
              />
              <TextInput
                testID="mychart-password"
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!connecting}
              />
              <Pressable
                testID="mychart-signin"
                style={[styles.primaryButton, connecting && styles.disabled]}
                onPress={handleConnectMyChart}
                disabled={connecting}
              >
                {connecting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Sign in to MyChart</Text>
                )}
              </Pressable>
            </View>
          )}

          {step === "twofa" && (
            <View style={styles.center}>
              <Text style={styles.title}>Verify it's you</Text>
              <Text style={styles.body}>
                Enter the verification code MyChart sent to{" "}
                <Text style={styles.bodyEm}>{twoFaDelivery ?? "your inbox"}</Text>.
              </Text>
              <TextInput
                testID="twofa-code"
                style={[styles.input, styles.codeInput]}
                placeholder="123456"
                placeholderTextColor="#999"
                value={twoFaCode}
                onChangeText={setTwoFaCode}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                maxLength={8}
                editable={!verifying2fa}
              />
              <Pressable
                testID="twofa-verify"
                style={[styles.primaryButton, verifying2fa && styles.disabled]}
                onPress={handleVerify2fa}
                disabled={verifying2fa}
              >
                {verifying2fa ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Verify</Text>
                )}
              </Pressable>
            </View>
          )}

          {step === "passkey" && (
            <View style={styles.center}>
              <Text style={styles.title}>Skip the password forever</Text>
              <Text style={styles.body}>
                Set up a passkey on your MyChart account so OpenRecord can sign
                in automatically — no password, no 2FA codes.
              </Text>
              <Pressable
                testID="passkey-setup"
                style={[styles.primaryButton, registeringPasskey && styles.disabled]}
                onPress={handleRegisterPasskey}
                disabled={registeringPasskey}
              >
                {registeringPasskey ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Set up passkey</Text>
                )}
              </Pressable>
              <Pressable
                testID="passkey-skip"
                style={styles.secondaryButton}
                onPress={handleSkipPasskey}
                disabled={registeringPasskey}
              >
                <Text style={styles.secondaryButtonText}>Skip for now</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24 },
  center: { alignItems: "center" },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#000",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 18,
    color: "#666",
    marginBottom: 24,
    textAlign: "center",
  },
  body: {
    fontSize: 15,
    color: "#666",
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 24,
    maxWidth: 320,
  },
  bodyEm: { color: "#000", fontWeight: "600" },
  metaText: {
    fontSize: 13,
    color: "#888",
    marginBottom: 12,
  },
  input: {
    width: "100%",
    backgroundColor: "#f5f5f5",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  codeInput: {
    fontSize: 22,
    letterSpacing: 6,
    textAlign: "center",
  },
  primaryButton: {
    width: "100%",
    backgroundColor: "#000",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    marginTop: 12,
    paddingVertical: 8,
  },
  secondaryButtonText: {
    color: "#007AFF",
    fontSize: 15,
  },
  disabled: { opacity: 0.6 },

  // Picker
  pickerHeader: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 8,
  },
  pickerTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#000",
  },
  pickerSubtitle: {
    fontSize: 13,
    color: "#888",
    marginTop: 4,
  },
  pickerSearchWrap: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  pickerSearch: {
    backgroundColor: "#f0f0f0",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  pickerListContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  pickerRowPressed: {
    backgroundColor: "#f7f7f7",
  },
  pickerLogo: {
    width: 36,
    height: 36,
    marginRight: 12,
    borderRadius: 6,
    backgroundColor: "#fafafa",
  },
  pickerLogoFallback: {
    backgroundColor: "#eee",
  },
  pickerRowText: {
    flex: 1,
    minWidth: 0,
  },
  pickerRowName: {
    fontSize: 15,
    fontWeight: "500",
    color: "#1a1a1a",
  },
  pickerRowHost: {
    fontSize: 12,
    color: "#888",
    marginTop: 2,
  },
  pickerChevron: {
    fontSize: 22,
    color: "#bbb",
    marginLeft: 8,
  },
  pickerFooter: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    alignItems: "center",
  },
  pickerEmpty: {
    paddingVertical: 32,
    alignItems: "center",
  },
  pickerEmptyText: {
    fontSize: 14,
    color: "#888",
    marginBottom: 8,
    textAlign: "center",
  },

  // Selected instance summary on the credentials step
  selectedInstance: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f7f7f7",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  selectedInstanceLogo: {
    width: 36,
    height: 36,
    borderRadius: 6,
    marginRight: 12,
    backgroundColor: "#fff",
  },
  selectedInstanceName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1a1a1a",
  },
  selectedInstanceHost: {
    fontSize: 12,
    color: "#888",
    marginTop: 2,
  },
  selectedInstanceChange: {
    fontSize: 14,
    color: "#007AFF",
    fontWeight: "500",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});
