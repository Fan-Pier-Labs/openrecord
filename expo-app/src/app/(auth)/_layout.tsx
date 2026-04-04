import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="chat/[id]"
        options={{
          headerShown: true,
          headerTitle: "Chat",
          headerBackTitle: "Back",
        }}
      />
    </Stack>
  );
}
