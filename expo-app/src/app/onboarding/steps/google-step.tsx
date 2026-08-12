import { useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Alert } from "react-native";
import { signInWithGoogle } from "@/lib/backend/google-signin";
import { setBackendSession } from "@/lib/backend/session";
import { IS_E2E, DEV_OR_E2E } from "@/lib/e2e";
import { StepLayout } from "../step-layout";
import { styles } from "../styles";

type Props = {
  /** Email of the already-signed-in user, if a backend session exists. */
  initialEmail: string | null;
  /** Called once the user has a confirmed backend session. */
  onSignedIn: (email: string) => void;
};

export function GoogleStep({ initialEmail, onSignedIn }: Props) {
  const [signingIn, setSigningIn] = useState(false);

  async function handleSignIn() {
    setSigningIn(true);
    try {
      const user = await signInWithGoogle();
      onSignedIn(user.email);
    } catch (err) {
      Alert.alert("Sign-in failed", (err as Error).message);
    } finally {
      setSigningIn(false);
    }
  }

  // Dev/E2E escape hatch: skip Google so automated tests and simulator
  // sessions can walk the rest of the onboarding flow without an OAuth
  // round-trip. Stripped from production bundles by the DEV_OR_E2E gate.
  // E2E builds also get a fake backend session so the free-tier AI path
  // works against the mock AI server the test run points the app at.
  async function handleDevSkip() {
    if (IS_E2E) {
      await setBackendSession({
        token: "e2e-test-token",
        user: { id: "e2e-user", email: "dev@openrecord.local", name: "E2E Tester" },
      });
    }
    onSignedIn("dev@openrecord.local");
  }

  const alreadySignedIn = !!initialEmail;

  return (
    <StepLayout>
      <View style={styles.center}>
        <Text style={styles.title}>Sign in with Google</Text>
        <Text style={styles.body}>
          Get $50 / month of AI credit included — no API key needed. We only see
          your email and name. Your medical data never leaves your device.
        </Text>
        {initialEmail ? (
          <Text style={styles.metaText}>Signed in as {initialEmail}</Text>
        ) : null}
        <Pressable
          testID="google-continue"
          style={[styles.primaryButton, signingIn && styles.disabled]}
          onPress={alreadySignedIn ? () => onSignedIn(initialEmail!) : handleSignIn}
          disabled={signingIn}
        >
          {signingIn ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {alreadySignedIn ? "Continue" : "Continue with Google"}
            </Text>
          )}
        </Pressable>
        {DEV_OR_E2E && !alreadySignedIn ? (
          <Pressable
            testID="google-dev-skip"
            style={styles.secondaryButton}
            onPress={handleDevSkip}
            disabled={signingIn}
          >
            <Text style={styles.secondaryButtonText}>Skip (dev)</Text>
          </Pressable>
        ) : null}
      </View>
    </StepLayout>
  );
}
