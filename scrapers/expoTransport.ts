import type { Transport } from './http';

// The Expo app's fetch, or undefined everywhere else. This file is the
// Node/Bun answer; the app's Metro config swaps it for
// expo-app/shims/expo-transport.ts, which imports expo/fetch. Keeping the
// import there keeps Expo out of the CLI and MCPB bundles.
export const expoTransport: Transport | undefined = undefined;
