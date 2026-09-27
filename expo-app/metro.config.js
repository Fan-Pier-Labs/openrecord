const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Prefer browser builds of libraries like cheerio that publish one.
config.resolver.unstable_conditionNames = ["browser", "require", "react-native"];
config.resolver.resolverMainFields = ["browser", "react-native", "main"];

const emptyShim = path.resolve(__dirname, "shims/fs-empty.js");

// Only the modules our code actually touches:
//  - zlib: shared CLO parser calls inflateSync (backed by pako here).
//  - fs / net / tls / child_process / dns: never actually called at runtime
//    in RN — we only need them to bundle because scraper source imports them.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  zlib: path.resolve(__dirname, "shims/zlib-pako.js"),
  crypto: require.resolve("react-native-quick-crypto"),
  buffer: require.resolve("buffer/index.js"),
  stream: require.resolve("readable-stream"),
  path: require.resolve("path-browserify"),
  url: require.resolve("url/url.js"),
  util: require.resolve("util/util.js"),
  events: require.resolve("events/events.js"),
  assert: require.resolve("assert/build/assert.js"),
  http: require.resolve("stream-http"),
  https: require.resolve("https-browserify"),
  os: require.resolve("os-browserify/browser"),
  string_decoder: require.resolve("string_decoder/lib/string_decoder.js"),
  querystring: require.resolve("querystring-es3"),
  fs: emptyShim,
  net: emptyShim,
  tls: emptyShim,
  child_process: emptyShim,
  dgram: emptyShim,
  dns: emptyShim,
  diagnostics_channel: emptyShim,
  async_hooks: emptyShim,
  worker_threads: emptyShim,
  perf_hooks: emptyShim,
  tty: emptyShim,
  readline: emptyShim,
  vm: emptyShim,
  inspector: emptyShim,
};

// Strip the `node:` prefix so specifiers like `node:stream` fall through to
// whatever the regular resolver would pick (RN's built-ins / browser shims).
const telemetryNoop = path.resolve(__dirname, "shims/telemetry-noop.ts");
const expoTransportStub = path.resolve(__dirname, "../scrapers/expoTransport.ts");
const expoTransportShim = path.resolve(__dirname, "shims/expo-transport.ts");

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // shared/telemetry is server-only (os, crypto, child_process). RN gets a noop.
  if (moduleName.endsWith("/shared/telemetry") || moduleName === "../../shared/telemetry") {
    return { type: "sourceFile", filePath: telemetryNoop };
  }
  if (moduleName.startsWith("node:")) {
    try {
      return context.resolveRequest(context, moduleName.slice(5), platform);
    } catch {
      return { type: "sourceFile", filePath: emptyShim };
    }
  }
  const resolved = originalResolveRequest
    ? originalResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
  // scrapers/expoTransport.ts is the Node/Bun stub; the app gets expo/fetch.
  // Matched on the resolved file, not the specifier, so no importer can miss it.
  if (resolved.type === "sourceFile" && resolved.filePath === expoTransportStub) {
    return { type: "sourceFile", filePath: expoTransportShim };
  }
  return resolved;
};

// Watch the parent repo so shared scrapers resolve from the worktree.
config.watchFolders = [
  ...(config.watchFolders ?? []),
  path.resolve(__dirname, ".."),
];

// Ensure files outside expo-app/ (e.g. scrapers/) can resolve packages
// from the expo-app node_modules — critical for EAS local builds which
// copy the project to a temp directory.
config.resolver.nodeModulesPaths = [
  ...(config.resolver.nodeModulesPaths ?? []),
  path.resolve(__dirname, "node_modules"),
];

module.exports = config;
