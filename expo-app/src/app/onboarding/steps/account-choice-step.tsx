import { useState } from "react";
import { View, Text, Pressable, TextInput, Image } from "react-native";
import {
  hostnameFromInstance,
  type MyChartInstance,
} from "@/lib/mychart-instances";
import { StepLayout } from "../step-layout";
import { styles } from "../styles";

export type AccountChoice = "sign-in" | "activate" | "signup" | "recover";

type Props = {
  /** Provider chosen on the picker, or null when the user is entering a host manually. */
  instance: MyChartInstance | null;
  onChangeInstance: () => void;
  /** Resolved hostname + the branch the user picked. */
  onChoose: (choice: AccountChoice, hostname: string) => void;
};

/**
 * The hub after picking an organization: "do you have an account?". Routes to
 * the existing sign-in flow or one of the no-account / forgot-login branches
 * (Vision Implementation plan §7). When the org was entered manually we collect
 * the hostname here so every downstream branch has one.
 */
export function AccountChoiceStep({ instance, onChangeInstance, onChoose }: Props) {
  const [hostname, setHostname] = useState(
    instance ? hostnameFromInstance(instance) : "",
  );

  const resolvedHost = instance ? hostnameFromInstance(instance) : hostname.trim();
  const canProceed = !!resolvedHost;

  const choices: { id: AccountChoice; title: string; subtitle: string; testID: string }[] = [
    {
      id: "sign-in",
      title: "Sign in",
      subtitle: "I have an account and know my username & password",
      testID: "choice-sign-in",
    },
    {
      id: "activate",
      title: "I have an activation code",
      subtitle: "From an enrollment letter or After-Visit Summary",
      testID: "choice-activate",
    },
    {
      id: "signup",
      title: "Create a new account",
      subtitle: "Sign up with your personal information",
      testID: "choice-signup",
    },
    {
      id: "recover",
      title: "Forgot username or password",
      subtitle: "Recover access with a code sent to your email or phone",
      testID: "choice-recover",
    },
  ];

  return (
    <StepLayout>
      <View style={styles.center}>
        <Text style={styles.title}>Get connected</Text>
        <Text style={styles.body}>
          Everything stays on your device. How would you like to connect your
          MyChart account?
        </Text>

        {instance ? (
          <View style={styles.selectedInstance}>
            {instance.logoUrl ? (
              <Image
                source={{ uri: instance.logoUrl }}
                style={styles.selectedInstanceLogo}
                resizeMode="contain"
              />
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={styles.selectedInstanceName} numberOfLines={1}>
                {instance.name}
              </Text>
              <Text style={styles.selectedInstanceHost} numberOfLines={1}>
                {resolvedHost}
              </Text>
            </View>
            <Pressable testID="choice-change" onPress={onChangeInstance}>
              <Text style={styles.selectedInstanceChange}>Change</Text>
            </Pressable>
          </View>
        ) : (
          <TextInput
            testID="choice-hostname"
            style={styles.input}
            placeholder="mychart.example.org"
            placeholderTextColor="#999"
            value={hostname}
            onChangeText={setHostname}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        )}

        {choices.map((c) => (
          <Pressable
            key={c.id}
            testID={c.testID}
            disabled={!canProceed}
            style={({ pressed }) => [
              styles.choiceButton,
              pressed && styles.choiceButtonPressed,
              !canProceed && styles.disabled,
            ]}
            onPress={() => onChoose(c.id, resolvedHost)}
          >
            <Text style={styles.choiceButtonTitle}>{c.title}</Text>
            <Text style={styles.choiceButtonSubtitle}>{c.subtitle}</Text>
          </Pressable>
        ))}
      </View>
    </StepLayout>
  );
}
