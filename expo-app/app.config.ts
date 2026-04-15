import type { ExpoConfig } from "expo/config";

// Reversed iOS OAuth client ID (e.g. com.googleusercontent.apps.1234-abc).
// Required for Google sign-in. Set via env var or fall back to the committed value.
const iosUrlScheme =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME ??
  "com.googleusercontent.apps.REPLACE_ME";

const googleSigninPlugin: [string, { iosUrlScheme: string }] = [
  "@react-native-google-signin/google-signin",
  { iosUrlScheme },
];

const config: ExpoConfig = {
  name: "OpenRecord",
  slug: "openrecord",
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
    googleSigninPlugin,
  ],
  extra: {
    backendUrl:
      process.env.EXPO_PUBLIC_BACKEND_URL ??
      "https://openrecord.fanpierlabs.com",
    googleWebClientId:
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "",
    googleIosClientId:
      process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "",
  },
};

export default config;
