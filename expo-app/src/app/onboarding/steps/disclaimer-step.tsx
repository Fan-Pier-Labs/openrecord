// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { View, Text, Pressable, Platform, BackHandler } from "react-native";
import { StepLayout } from "../step-layout";
import { styles } from "../styles";

export function DisclaimerStep({
  onAgree,
  onExit,
}: {
  onAgree: () => void;
  onExit: () => void;
}) {
  return (
    <StepLayout>
      <View style={styles.center}>
        <Text style={styles.warningIcon}>⚠️</Text>
        <Text style={styles.title}>Before you continue</Text>

        <View style={styles.disclosureCard}>
          <Text style={styles.disclosureItem}>
            <Text style={styles.bodyEm}>OpenRecord is provided as-is,</Text>{" "}
            without warranty of any kind, and you use it at your own risk.
          </Text>
          <Text style={styles.disclosureItem}>
            <Text style={styles.bodyEm}>We are not affiliated with Epic or MyChart.</Text>{" "}
            OpenRecord is an independent project, not endorsed or sponsored by
            Epic Systems Corporation.
          </Text>
          <Text style={styles.disclosureItem}>
            <Text style={styles.bodyEm}>It may violate Epic&rsquo;s terms of service.</Text>{" "}
            By continuing, you accept that risk.
          </Text>
        </View>

        <Pressable
          testID="disclaimer-agree"
          style={styles.primaryButton}
          onPress={onAgree}
        >
          <Text style={styles.primaryButtonText}>I agree</Text>
        </Pressable>
        <Pressable
          testID="disclaimer-exit"
          style={styles.secondaryButton}
          onPress={() => {
            // iOS has no sanctioned way for an app to quit itself, so Exit
            // there returns to the welcome screen instead.
            if (Platform.OS === "android") BackHandler.exitApp();
            else onExit();
          }}
        >
          <Text style={styles.secondaryButtonText}>Exit</Text>
        </Pressable>
      </View>
    </StepLayout>
  );
}
