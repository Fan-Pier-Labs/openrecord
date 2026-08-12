/**
 * Web shim for @react-native-google-signin/google-signin.
 * The native Google sign-in sheet doesn't exist in the browser; the web
 * export is a dev/test target where onboarding uses the E2E skip path.
 */

function notSupported(): never {
  throw new Error("Google sign-in requires a native build (iOS/Android).");
}

export const GoogleSignin = {
  configure: () => {},
  hasPlayServices: async () => true,
  signIn: notSupported,
  signOut: async () => {},
};

export const statusCodes = {
  SIGN_IN_CANCELLED: "SIGN_IN_CANCELLED",
  IN_PROGRESS: "IN_PROGRESS",
  PLAY_SERVICES_NOT_AVAILABLE: "PLAY_SERVICES_NOT_AVAILABLE",
};
