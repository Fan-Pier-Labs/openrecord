import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, ".."),
  typescript: {
    // Type checking runs separately in CI; skip during Docker build to avoid OOM
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
