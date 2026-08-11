import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "OpenRecord",
  slug: "openrecord",
  owner: "fanpierlabs",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  scheme: "openrecord",
  newArchEnabled: true,
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.fanpierlabs.openrecord",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSFaceIDUsageDescription: "OpenRecord uses Face ID to protect your health data.",
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#ffffff",
    },
    edgeToEdgeEnabled: true,
    package: "com.fanpierlabs.openrecord",
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-sqlite",
    "expo-font",
    "expo-local-authentication",
  ],
  extra: {
    eas: {
      projectId: "6ed85fb8-688f-44c3-8ecb-e8019524f524",
    },
    // The public OpenRecord AI endpoint (openrecord-demo-lambda) backing
    // the free tier. No auth — abuse controls live server-side.
    backendUrl:
      process.env.EXPO_PUBLIC_BACKEND_URL ??
      "https://dur15eh31e.execute-api.us-east-2.amazonaws.com",
  },
};

export default config;
