import { useState } from "react";
import { View, Text, Pressable, TextInput, Alert, ActivityIndicator } from "react-native";
import {
  addMyChartAccount,
  type StoredMyChartAccount,
} from "@/lib/storage/secure-store";
import { connectAccount } from "@/lib/scrapers/session-manager";
import { startSelfSignup, verifySignupCode, finishSignup } from "@/lib/scrapers/onboarding-auth";
import type { SignupGender } from "../../../../../scrapers/myChart/signup";
import { StepLayout } from "../step-layout";
import { styles } from "../styles";

type Props = {
  hostname: string;
  onBack: () => void;
  onLoggedIn: (account: StoredMyChartAccount) => void;
};

type Phase = "demographics" | "verify" | "credentials";

const GENDERS: SignupGender[] = ["Female", "Male", "Unknown"];

/**
 * Self-signup (identity match). Three phases: enter demographics → confirm the
 * one-time code sent to the email → choose a username & password.
 *
 * Note: on a real Epic portal this submit is gated by reCAPTCHA Enterprise and
 * would need a WebView to mint the token (see onboarding-auth.ts). Against
 * fake-mychart there's no bot protection, so the flow runs straight through.
 */
export function SignupStep({ hostname, onBack, onLoggedIn }: Props) {
  const [phase, setPhase] = useState<Phase>("demographics");
  const [busy, setBusy] = useState(false);

  // Demographics
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState<SignupGender>("Unknown");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [zip, setZip] = useState("");

  // Verification + credentials
  const [flowId, setFlowId] = useState<string | null>(null);
  const [deliveryMasked, setDeliveryMasked] = useState<string>("your email");
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmitDemographics() {
    if (!firstName.trim() || !lastName.trim() || !dob.trim() || !email.trim()) {
      Alert.alert("Missing info", "Name, date of birth, and email are required.");
      return;
    }
    setBusy(true);
    try {
      const result = await startSelfSignup(hostname, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dateOfBirth: dob.trim(),
        email: email.trim(),
        gender,
        address: { street: street.trim(), city: city.trim(), state: stateCode.trim(), zip: zip.trim() },
      });
      if (result.state === "need_contact_verification") {
        setFlowId(result.flowId);
        setDeliveryMasked(result.deliveryMasked ?? "your email");
        setPhase("verify");
        return;
      }
      if (result.state === "account_exists") {
        Alert.alert(
          "Account already exists",
          "There's already a MyChart account for that email. Try signing in or recovering your login instead.",
        );
        return;
      }
      Alert.alert("Could not sign up", result.error ?? "Please check your information and try again.");
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
      const result = await verifySignupCode(flowId, code.trim());
      if (result.state === "verified") {
        setPhase("credentials");
        return;
      }
      Alert.alert("Incorrect code", "That code didn't match. Please try again.");
    } catch (err) {
      Alert.alert("Connection failed", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    if (!username.trim() || !password || !flowId) {
      Alert.alert("Missing info", "Choose a username and password.");
      return;
    }
    setBusy(true);
    try {
      const result = await finishSignup(flowId, username.trim(), password);
      if (result.state === "created") {
        const account = await addMyChartAccount({
          hostname: result.hostname,
          username: result.username,
          password: result.password,
        });
        await connectAccount(account);
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

  if (phase === "verify") {
    return (
      <StepLayout>
        <View style={styles.center}>
          <Text style={styles.title}>Verify your email</Text>
          <Text style={styles.body}>
            We sent a 6-digit code to {deliveryMasked}. Enter it below to continue.
          </Text>
          <TextInput
            testID="signup-code"
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
            testID="signup-verify"
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

  if (phase === "credentials") {
    return (
      <StepLayout>
        <View style={styles.center}>
          <Text style={styles.title}>Choose a login</Text>
          <Text style={styles.body}>Pick a username and password for your new MyChart account.</Text>
          <TextInput
            testID="signup-username"
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
            testID="signup-password"
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#999"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!busy}
          />
          <Pressable
            testID="signup-create"
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

  // Demographics phase
  return (
    <StepLayout>
      <View style={styles.center}>
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.body}>
          Enter your information so {hostname} can match you to your records.
        </Text>

        <View style={styles.rowInputs}>
          <TextInput
            testID="signup-first-name"
            style={[styles.input, styles.flex1]}
            placeholder="First name"
            placeholderTextColor="#999"
            value={firstName}
            onChangeText={setFirstName}
            autoCorrect={false}
            editable={!busy}
          />
          <TextInput
            testID="signup-last-name"
            style={[styles.input, styles.flex1]}
            placeholder="Last name"
            placeholderTextColor="#999"
            value={lastName}
            onChangeText={setLastName}
            autoCorrect={false}
            editable={!busy}
          />
        </View>

        <TextInput
          testID="signup-dob"
          style={styles.input}
          placeholder="Date of birth (MM/DD/YYYY)"
          placeholderTextColor="#999"
          value={dob}
          onChangeText={setDob}
          autoCorrect={false}
          editable={!busy}
        />
        <TextInput
          testID="signup-email"
          style={styles.input}
          placeholder="Email address"
          placeholderTextColor="#999"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          editable={!busy}
        />

        <Text style={styles.fieldLabel}>Legal sex</Text>
        <View style={[styles.rowInputs, { marginBottom: 12 }]}>
          {GENDERS.map((g) => (
            <Pressable
              key={g}
              testID={`signup-gender-${g.toLowerCase()}`}
              style={[
                styles.choiceButton,
                styles.flex1,
                { marginBottom: 0, paddingVertical: 10, alignItems: "center" },
                gender === g && { borderColor: "#000", backgroundColor: "#f2f2f2" },
              ]}
              onPress={() => setGender(g)}
              disabled={busy}
            >
              <Text style={styles.choiceButtonTitle}>{g}</Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          testID="signup-street"
          style={styles.input}
          placeholder="Street address"
          placeholderTextColor="#999"
          value={street}
          onChangeText={setStreet}
          autoCorrect={false}
          editable={!busy}
        />
        <View style={styles.rowInputs}>
          <TextInput
            testID="signup-city"
            style={[styles.input, styles.flex1]}
            placeholder="City"
            placeholderTextColor="#999"
            value={city}
            onChangeText={setCity}
            autoCorrect={false}
            editable={!busy}
          />
          <TextInput
            testID="signup-state"
            style={[styles.input, { width: 70 }]}
            placeholder="State"
            placeholderTextColor="#999"
            value={stateCode}
            onChangeText={setStateCode}
            autoCorrect={false}
            editable={!busy}
          />
          <TextInput
            testID="signup-zip"
            style={[styles.input, { width: 90 }]}
            placeholder="ZIP"
            placeholderTextColor="#999"
            value={zip}
            onChangeText={setZip}
            keyboardType="number-pad"
            editable={!busy}
          />
        </View>

        <Pressable
          testID="signup-submit"
          style={[styles.primaryButton, busy && styles.disabled]}
          onPress={handleSubmitDemographics}
          disabled={busy}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Continue</Text>}
        </Pressable>
        <Pressable testID="signup-back" style={styles.secondaryButton} onPress={onBack} disabled={busy}>
          <Text style={styles.secondaryButtonText}>Back</Text>
        </Pressable>
      </View>
    </StepLayout>
  );
}
