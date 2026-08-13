import { join } from 'path';
import type { NextConfig } from 'next';

// `@shared/*` resolves to the repo's shared/ directory, one level above this
// Next project — the AMF3 writer and CLO wrapper encoder live there so a
// wrapper this server synthesizes can't drift from what clients decode.
//
// Both settings are load-bearing, and only one of them fails locally:
// `externalDir` lets Next compile files above the project root, and
// `turbopack.root` tells Turbopack how far above it may resolve. Turbopack
// infers that root from the nearest lockfile, which in a checkout is the repo
// root (so it works) but in the Docker image is this directory (so it does
// not) — the image carries only fake-mychart/ and shared/. Pinning it to the
// parent makes both the same.
const repoRoot = join(import.meta.dirname, '..');

const nextConfig: NextConfig = {
  experimental: { externalDir: true },
  turbopack: { root: repoRoot },
};

export default nextConfig;
