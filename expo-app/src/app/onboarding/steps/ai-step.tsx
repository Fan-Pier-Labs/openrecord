import { View, Text, Pressable, Linking } from "react-native";
import { fireAndForget } from "@/lib/fire-and-forget";
import { StepLayout } from "../step-layout";
import { styles } from "../styles";

const PRIVACY_URL = "https://openrecord.fanpierlabs.com/privacy.html";

/**
 * The one screen that says out loud where health data goes.
 *
 * Everything else about OpenRecord runs on the device, which is exactly what
 * makes the AI call the part a user would not think to ask about: answering a
 * question means handing the relevant part of their record to a model provider
 * we have no business associate agreement with. It runs before MyChart is
 * connected, so the disclosure lands while there is still nothing to send.
 */
export function AiStep({ onAccept }: { onAccept: () => void }) {
  return (
    <StepLayout>
      <View style={styles.center}>
        <Text style={styles.title}>Where your data goes</Text>
        <Text style={styles.body}>
          OpenRecord reads your chart on this iPhone and keeps it here. Asking
          the AI about it is the one exception.
        </Text>

        <View style={styles.disclosureCard}>
          <Text style={styles.disclosureItem}>
            <Text style={styles.bodyEm}>Answering a question sends part of your record away.</Text>{" "}
            With the included credit it goes to an OpenRecord server and on to
            Google&rsquo;s Gemini API, which is what writes the answer.
          </Text>
          <Text style={styles.disclosureItem}>
            <Text style={styles.bodyEm}>Your MyChart password never does.</Text>{" "}
            It stays in this iPhone&rsquo;s Keychain — we never receive it, and
            neither does Google.
          </Text>
          <Text style={styles.disclosureItem}>
            <Text style={styles.bodyEm}>We don&rsquo;t keep your questions.</Text>{" "}
            Our server logs how many tokens a call used, never what it said.
            Google then handles it under its own terms.
          </Text>
          <Text style={styles.disclosureItem}>
            <Text style={styles.bodyEm}>You can cut us out.</Text> Add your own
            API key in Settings and your data goes straight to that provider
            instead.
          </Text>
        </View>

        <Pressable
          testID="ai-disclosure-accept"
          style={styles.primaryButton}
          onPress={onAccept}
        >
          <Text style={styles.primaryButtonText}>Got it</Text>
        </Pressable>
        <Pressable
          testID="ai-disclosure-privacy"
          style={styles.secondaryButton}
          onPress={() =>
            fireAndForget(Linking.openURL(PRIVACY_URL), "onboarding:privacyPolicy")
          }
        >
          <Text style={styles.secondaryButtonText}>Read the privacy policy</Text>
        </Pressable>
      </View>
    </StepLayout>
  );
}
