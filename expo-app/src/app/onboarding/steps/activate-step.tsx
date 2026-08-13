import { useState } from "react";
import { View, Text, Pressable, TextInput, Alert, ActivityIndicator } from "react-native";
import {
  addMyChartAccount,
  type StoredMyChartAccount,
} from "@/lib/storage/secure-store";
import { connectAccount } from "@/lib/scrapers/session-manager";
import { startActivationCodeSignup, finishSignup } from "@/lib/scrapers/onboarding-auth";
import { StepLayout } from "../step-layout";
import { styles } from "../styles";

type Props = {
  hostname: string;
  onBack: () => void;
  /** Account created + connected (no 2FA on a fresh account). */
  onLoggedIn: (account: StoredMyChartAccount) => void;
};

type Phase = "code" | "credentials";

/**
 * Activation-code signup: enter the code from an enrollment letter / After-Visit
 * Summary, then choose a username + password. The code proves identity, so no
 * separate email/SMS verification is needed.
 */
export function ActivateStep({ hostname, onBack, onLoggedIn }: Props) {
  const [phase, setPhase] = useState<Phase>("code");
  const [code, setCode] = useState("");
  const [dob, setDob] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [flowId, setFlowId] = useState<string | null>(null);

  async function handleVerifyCode() {
    if (!code.trim()) {
      Alert.alert("Missing code", "Enter your activation code.");
      return;
    }
    setBusy(true);
    try {
      const result = await startActivationCodeSignup(hostname, code.trim(), dob.trim() || undefined);
      if (result.state === "valid") {
        setFlowId(result.flowId);
        setPhase("credentials");
        return;
      }
      if (result.state === "invalid") {
        Alert.alert("Code not recognized", "Double-check your activation code and try again.");
        return;
      }
      Alert.alert("Something went wrong", result.error ?? "Please try again.");
    } catch (err) {
      Alert.alert("Connection failed", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    if (!username.trim() || !password) {
      Alert.alert("Missing info", "Choose a username and password.");
      return;
    }
    if (!flowId) return;
    setBusy(true);
    try {
      const result = await finishSignup(flowId, username.trim(), password);
      if (result.state === "created") {
        const account = await addMyChartAccount({
          hostname: result.hostname,
          username: result.username,
          password: result.password,
        });
        const conn = await connectAccount(account);
        if (conn.state === "logged_in") {
          onLoggedIn(account);
          return;
        }
        Alert.alert("Account created", "Your account was created — please sign in to finish.");
        onLoggedIn(account);
        return;
      }
      if (result.state === "username_taken") {
        Alert.alert("Username taken", "That username is already in use. Try another.");
        return;
      }
      Alert.alert("Could not create account", result.error ?? "Please try again.");
    } catch (err) {
      Alert.alert("Connection failed", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (phase === "code") {
    return (
      <StepLayout>
        <View style={styles.center}>
          <Text style={styles.title}>Activation code</Text>
          <Text style={styles.body}>
            Enter the activation code from your enrollment letter or After-Visit
            Summary.
          </Text>
          <TextInput
            testID="activate-code"
            style={styles.input}
            placeholder="XXXXX-XXXXX-XXXXX"
            placeholderTextColor="#999"
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!busy}
          />
          <TextInput
            testID="activate-dob"
            style={styles.input}
            placeholder="Date of birth (MM/DD/YYYY)"
            placeholderTextColor="#999"
            value={dob}
            onChangeText={setDob}
            autoCorrect={false}
            editable={!busy}
          />
          <Pressable
            testID="activate-verify"
            style={[styles.primaryButton, busy && styles.disabled]}
            onPress={handleVerifyCode}
            disabled={busy}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Continue</Text>}
          </Pressable>
          <Pressable testID="activate-back" style={styles.secondaryButton} onPress={onBack} disabled={busy}>
            <Text style={styles.secondaryButtonText}>Back</Text>
          </Pressable>
        </View>
      </StepLayout>
    );
  }

  return (
    <StepLayout>
      <View style={styles.center}>
        <Text style={styles.title}>Choose a login</Text>
        <Text style={styles.body}>Pick a username and password for your new MyChart account.</Text>
        <TextInput
          testID="activate-username"
          style={styles.input}
          placeholder="Username"
          placeholderTextColor="#999"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
        />
        <TextInput
          testID="activate-password"
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#999"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!busy}
        />
        <Pressable
          testID="activate-create"
          style={[styles.primaryButton, busy && styles.disabled]}
          onPress={handleCreate}
          disabled={busy}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Create account</Text>}
        </Pressable>
      </View>
    </StepLayout>
  );
}
