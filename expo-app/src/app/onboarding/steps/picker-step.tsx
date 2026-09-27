import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  FAKE_MYCHART_DEMO,
  SANDBOX_UNAVAILABLE_NOTE,
  hostnameFromInstance,
  isSandboxAvailable,
  searchInstances,
  type MyChartInstance,
} from "@/lib/mychart-instances";
import { useInstances } from "@/lib/use-instances";
import { InstanceLogo } from "@/components/InstanceLogo";
import { styles } from "../styles";

type Props = {
  onPick: (instance: MyChartInstance) => void;
  onManualEntry: () => void;
};

export function PickerStep({ onPick, onManualEntry }: Props) {
  const [query, setQuery] = useState("");
  const instances = useInstances();

  // The demo entry points at a single deployment that gets torn down when it
  // isn't worth its bill. Assume it's up until the probe says otherwise, so a
  // slow network doesn't grey out a working sandbox.
  const [sandboxDown, setSandboxDown] = useState(false);
  useEffect(() => {
    let live = true;
    void isSandboxAvailable().then((up) => {
      if (live) setSandboxDown(!up);
    });
    return () => {
      live = false;
    };
  }, []);

  const filteredInstances = useMemo(
    () => searchInstances(query, instances),
    [query, instances],
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.pickerHeader}>
        <Text style={styles.pickerTitle}>Find your provider</Text>
        <Text style={styles.pickerSubtitle}>
          {filteredInstances.length} of {instances.length} MyChart sites
        </Text>
      </View>
      <View style={styles.pickerSearchWrap}>
        <TextInput
          testID="picker-search"
          style={styles.pickerSearch}
          placeholder="Search by hospital, system, or city"
          placeholderTextColor="#999"
          value={query}
          onChangeText={setQuery}
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
              No MyChart sites match "{query}".
            </Text>
            <Pressable
              testID="picker-manual-empty"
              accessibilityLabel="Enter hostname manually"
              accessibilityRole="button"
              style={styles.secondaryButton}
              onPress={onManualEntry}
            >
              <Text style={styles.secondaryButtonText}>Enter hostname manually</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => {
          const down = sandboxDown && item.slgId === FAKE_MYCHART_DEMO.slgId;
          return (
            <Pressable
              testID={`picker-item-${item.name}`}
              disabled={down}
              accessibilityState={{ disabled: down }}
              style={({ pressed }) => [
                styles.pickerRow,
                down && styles.pickerRowDisabled,
                pressed && !down && styles.pickerRowPressed,
              ]}
              onPress={() => onPick(item)}
            >
              <InstanceLogo
                testID={`picker-logo-${item.slgId}`}
                logoUrl={item.logoUrl}
                style={styles.pickerLogo}
                placeholderStyle={styles.pickerLogoFallback}
              />
              <View style={styles.pickerRowText}>
                <Text style={styles.pickerRowName} numberOfLines={1}>
                  {item.name}
                </Text>
                {down ? (
                  <Text testID="picker-item-unavailable" style={styles.pickerRowNote}>
                    {SANDBOX_UNAVAILABLE_NOTE}
                  </Text>
                ) : item.url ? (
                  <Text style={styles.pickerRowHost} numberOfLines={1}>
                    {hostnameFromInstance(item)}
                  </Text>
                ) : null}
              </View>
              {down ? null : <Text style={styles.pickerChevron}>›</Text>}
            </Pressable>
          );
        }}
      />
      <View style={styles.pickerFooter}>
        <Pressable
          testID="picker-manual"
          style={styles.secondaryButton}
          onPress={onManualEntry}
        >
          <Text style={styles.secondaryButtonText}>
            Don't see yours? Enter hostname manually
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
