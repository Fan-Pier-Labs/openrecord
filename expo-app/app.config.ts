import type { ExpoConfig } from "expo/config";

// Google OAuth client IDs. These are not secrets — iOS bakes the reversed
// client ID into its Info.plist URL schemes and ships it in every IPA, and
// the web client ID is used client-side too. The AI Lambda accepts both as
// valid ID-token audiences (see openrecord-demo-lambda/deploy.sh).
const GOOGLE_WEB_CLIENT_ID =
  "810533222194-p2dod0idou95jlh70qi07m84uscb4170.apps.googleusercontent.com";
const GOOGLE_IOS_CLIENT_ID =
  "810533222194-hhcn0nkf1mgelfrgq5vogbsjuemmvde8.apps.googleusercontent.com";
const GOOGLE_IOS_URL_SCHEME =
  "com.googleusercontent.apps.810533222194-hhcn0nkf1mgelfrgq5vogbsjuemmvde8";

const iosUrlScheme =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME ?? GOOGLE_IOS_URL_SCHEME;

const googleSigninPlugin: [string, { iosUrlScheme: string }] = [
  "@react-native-google-signin/google-signin",
  { iosUrlScheme },
];

// E2E test builds (Maestro / Playwright) talk to local servers over plain
// HTTP (fake-mychart + the mock AI backend), which release builds block by
// default on both platforms. EXPO_PUBLIC_E2E=1 is only ever set by the test
// tooling, so production builds keep the strict transport security defaults.
const isE2eBuild = process.env.EXPO_PUBLIC_E2E === "1";

const e2ePlugins: (string | [string, object])[] = isE2eBuild
  ? [
      // The iOS side of this (modular headers for google-signin's Firebase
      // pods) is now unconditional — see ./plugins/withModularHeaders — so
      // only the Android cleartext knob is left to flip for E2E.
      ["expo-build-properties", { android: { usesCleartextTraffic: true } }],
    ]
  : [];

const e2eInfoPlist = isE2eBuild
  ? {
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: true,
        NSAllowsLocalNetworking: true,
      },
    }
  : {};

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
      ...e2eInfoPlist,
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
    // Enables `use_modular_headers!` so google-signin's Firebase pods
    // (AppCheckCore / RecaptchaInterop) compile as static libraries.
    "./plugins/withModularHeaders",
    ...e2ePlugins,
  ],
  extra: {
    eas: {
      projectId: "6ed85fb8-688f-44c3-8ecb-e8019524f524",
    },
    // The OpenRecord AI endpoint (openrecord-demo-lambda) backing the free
    // tier. Requests carry the user's Google ID token; the Lambda verifies
    // it server-side and meters the included credit.
    backendUrl:
      process.env.EXPO_PUBLIC_BACKEND_URL ??
      "https://dur15eh31e.execute-api.us-east-2.amazonaws.com",
    googleWebClientId:
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? GOOGLE_WEB_CLIENT_ID,
    googleIosClientId:
      process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? GOOGLE_IOS_CLIENT_ID,
  },
};

export default config;
