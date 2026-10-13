// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="chat/[id]" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
