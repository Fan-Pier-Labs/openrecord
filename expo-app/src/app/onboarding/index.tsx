import { useState, useEffect } from "react";
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
import * as LocalAuthentication from "expo-local-authentication";
import { useAuth } from "@/lib/auth/auth-context";
import {
  setSecureValue,
  setClaudeApiKey,
  getClaudeApiKey,
  addMyChartAccount,
} from "@/lib/storage/secure-store";

type Step = "welcome" | "faceid" | "apikey" | "account" | "done";

export default function OnboardingScreen() {
  const { setSetupComplete } = useAuth();
  const [step, setStep] = useState<Step>("welcome");
  const [apiKey, setApiKey] = useState("");
  const [apiKeyLoaded, setApiKeyLoaded] = useState(false);
  const [hostname, setHostname] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Auto-load API key from secrets.local.json if available.
  // In dev, if the key is found, auto-complete onboarding to skip straight to chat.
  useEffect(() => {
    getClaudeApiKey().then(async (key) => {
      if (key) {
        setApiKey(key);
        setApiKeyLoaded(true);
        // Dev shortcut: if we have a key from secrets, skip onboarding entirely
        if (__DEV__) {
          await setSecureValue("setup_complete", "true");
          setSetupComplete();
        }
      }
    });
  }, []);

  async function handleFaceId() {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    if (hasHardware && isEnrolled) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Enable Face ID for OpenRecord",
        fallbackLabel: "Use Passcode",
      });
      if (result.success) {
        setStep(apiKeyLoaded ? "account" : "apikey");
      } else {
        Alert.alert("Authentication failed", "Try again or skip.");
      }
    } else {
      // No biometrics — skip
      setStep(apiKeyLoaded ? "account" : "apikey");
    }
  }

  async function handleSaveApiKey() {
    if (!apiKey.trim()) {
      Alert.alert("Error", "Please enter your Claude API key.");
      return;
    }
    await setClaudeApiKey(apiKey.trim());
    setStep("account");
  }

  async function handleAddAccount() {
    if (!hostname.trim() || !username.trim() || !password) {
      Alert.alert("Error", "All fields are required.");
      return;
    }

    await addMyChartAccount({
      hostname: hostname.trim(),
      username: username.trim(),
      password,
    });

    await finishSetup();
  }

  async function handleSkipAccount() {
    await finishSetup();
  }

  async function finishSetup() {
    await setSecureValue("setup_complete", "true");
    setSetupComplete();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {step === "welcome" && (
          <View style={styles.center}>
            <Text style={styles.title}>OpenRecord</Text>
            <Text style={styles.subtitle}>Your health data, on your device</Text>
            <Text style={styles.body}>
              OpenRecord connects directly to your MyChart accounts and stores
              everything locally on your phone. No servers, no cloud storage.
              Use AI to understand and manage your health data.
            </Text>
            <Pressable style={styles.primaryButton} onPress={() => setStep("faceid")}>
              <Text style={styles.primaryButtonText}>Get Started</Text>
            </Pressable>
          </View>
        )}

        {step === "faceid" && (
          <View style={styles.center}>
            <Text style={styles.title}>Secure Access</Text>
            <Text style={styles.body}>
              Protect your health data with Face ID. The app will require
              biometric authentication every time you open it.
            </Text>
            <Pressable style={styles.primaryButton} onPress={handleFaceId}>
              <Text style={styles.primaryButtonText}>Enable Face ID</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => setStep("apikey")}>
              <Text style={styles.secondaryButtonText}>Skip</Text>
            </Pressable>
          </View>
        )}

        {step === "apikey" && (
          <View style={styles.center}>
            <Text style={styles.title}>Claude API Key</Text>
            <Text style={styles.body}>
              Enter your Anthropic API key to enable AI-powered health data queries.
              Your key is stored securely in the iOS Keychain and never leaves your device.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="sk-ant-api03-..."
              placeholderTextColor="#999"
              value={apiKey}
              onChangeText={setApiKey}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
            <Pressable style={styles.primaryButton} onPress={handleSaveApiKey}>
              <Text style={styles.primaryButtonText}>Save API Key</Text>
            </Pressable>
          </View>
        )}

        {step === "account" && (
          <View style={styles.center}>
            <Text style={styles.title}>Add MyChart Account</Text>
            <Text style={styles.body}>
              Connect your first MyChart account. You can add more later in Settings.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="mychart.example.org"
              placeholderTextColor="#999"
              value={hostname}
              onChangeText={setHostname}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={styles.input}
              placeholder="Username"
              placeholderTextColor="#999"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#999"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            <Pressable style={styles.primaryButton} onPress={handleAddAccount}>
              <Text style={styles.primaryButtonText}>Add & Continue</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={handleSkipAccount}>
              <Text style={styles.secondaryButtonText}>Skip for now</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
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
    marginBottom: 32,
    maxWidth: 320,
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
});
