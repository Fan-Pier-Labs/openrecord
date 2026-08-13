import { useState } from "react";
import { View, Text, Pressable, TextInput, Alert, ActivityIndicator } from "react-native";
import {
  addMyChartAccount,
  type StoredMyChartAccount,
} from "@/lib/storage/secure-store";
import { connectAccount } from "@/lib/scrapers/session-manager";
import {
  startRecovery,
  sendRecoveryCode,
  verifyRecoveryCode,
  finishRecovery,
} from "@/lib/scrapers/onboarding-auth";
import { StepLayout } from "../step-layout";
import { styles } from "../styles";

type Props = {
  hostname: string;
  onBack: () => void;
  onLoggedIn: (account: StoredMyChartAccount) => void;
};

type Phase = "contact" | "code" | "reset";

/**
 * Unified account recovery (forgot username / password). Phases: enter the
 * email or phone used for two-step verification → confirm the one-time code
 * (which reveals the username) → set a new password. Then we connect with the
 * recovered username + new password.
 */
export function RecoverStep({ hostname, onBack, onLoggedIn }: Props) {
  const [phase, setPhase] = useState<Phase>("contact");
  const [busy, setBusy] = useState(false);

  const [contact, setContact] = useState("");
  const [flowId, setFlowId] = useState<string | null>(null);
  const [allowSMS, setAllowSMS] = useState(false);
  const [deliveryMasked, setDeliveryMasked] = useState("your inbox");
  const [code, setCode] = useState("");
  const [username, setUsername] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");

  async function handleStart(useSMS: boolean) {
    if (!contact.trim()) {
      Alert.alert("Missing info", "Enter your email or mobile phone.");
      return;
    }
    setBusy(true);
    try {
      const started = flowId
        ? { state: "ok" as const, flowId, settings: { allowEmail: true, allowSMS } }
        : await startRecovery(hostname, contact.trim());
      if (started.state !== "ok") {
        Alert.alert("Could not start recovery", "error" in started ? started.error ?? "" : "");
        return;
      }
      setFlowId(started.flowId);
      setAllowSMS(started.settings.allowSMS);
      const sent = await sendRecoveryCode(started.flowId, useSMS);
      if (sent.state === "sent") {
        setDeliveryMasked(sent.deliveryMasked ?? "your inbox");
        setPhase("code");
        return;
      }
      Alert.alert("Could not send code", sent.error ?? "Please try again.");
    } catch (err) {
      Alert.alert("Connection failed", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify() {
    if (!code.trim() || !flowId) {
      Alert.alert("Missing code", "Enter the code we sent you.");
      return;
    }
    setBusy(true);
    try {
      const result = await verifyRecoveryCode(flowId, code.trim());
      if (result.state === "verified") {
        setUsername(result.username ?? null);
        setPhase("reset");
        return;
      }
      Alert.alert("Incorrect code", "That code didn't match. Please try again.");
    } catch (err) {
      Alert.alert("Connection failed", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    if (!newPassword || !flowId) {
      Alert.alert("Missing info", "Enter a new password.");
      return;
    }
    setBusy(true);
    try {
      const result = await finishRecovery(flowId, newPassword);
      if (result.state === "reset") {
        const account = await addMyChartAccount({
          hostname: result.hostname,
          username: result.username,
          password: result.password,
        });
        await connectAccount(account);
        onLoggedIn(account);
        return;
      }
      Alert.alert("Could not reset password", result.error ?? "Please try again.");
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
          <Text style={styles.title}>Enter your code</Text>
          <Text style={styles.body}>We sent a 6-digit code to {deliveryMasked}.</Text>
          <TextInput
            testID="recover-code"
            style={[styles.input, styles.codeInput]}
            placeholder="000000"
            placeholderTextColor="#999"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
            editable={!busy}
          />
          <Pressable
            testID="recover-verify"
            style={[styles.primaryButton, busy && styles.disabled]}
            onPress={handleVerify}
            disabled={busy}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Verify</Text>}
          </Pressable>
        </View>
      </StepLayout>
    );
  }

  if (phase === "reset") {
    return (
      <StepLayout>
        <View style={styles.center}>
          <Text style={styles.title}>Set a new password</Text>
          <Text style={styles.body}>
            {username ? `Your username is "${username}". ` : ""}Choose a new password to finish.
          </Text>
          <TextInput
            testID="recover-new-password"
            style={styles.input}
            placeholder="New password"
            placeholderTextColor="#999"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            editable={!busy}
          />
          <Pressable
            testID="recover-reset"
            style={[styles.primaryButton, busy && styles.disabled]}
            onPress={handleReset}
            disabled={busy}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Reset & sign in</Text>}
          </Pressable>
        </View>
      </StepLayout>
    );
  }

  // Contact phase
  return (
    <StepLayout>
      <View style={styles.center}>
        <Text style={styles.title}>Recover your login</Text>
        <Text style={styles.body}>
          Enter the email or mobile phone you use for two-step verification. We'll
          send a one-time code to recover your username and reset your password.
        </Text>
        <TextInput
          testID="recover-contact"
          style={styles.input}
          placeholder="Email or mobile phone"
          placeholderTextColor="#999"
          value={contact}
          onChangeText={setContact}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
        />
        <Pressable
          testID="recover-send-email"
          style={[styles.primaryButton, busy && styles.disabled]}
          onPress={() => handleStart(false)}
          disabled={busy}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Email me a code</Text>}
        </Pressable>
        <Pressable
          testID="recover-send-sms"
          style={styles.secondaryButton}
          onPress={() => handleStart(true)}
          disabled={busy}
        >
          <Text style={styles.secondaryButtonText}>Text me a code instead</Text>
        </Pressable>
        <Pressable testID="recover-back" style={styles.secondaryButton} onPress={onBack} disabled={busy}>
          <Text style={styles.secondaryButtonText}>Back</Text>
        </Pressable>
      </View>
    </StepLayout>
  );
}
