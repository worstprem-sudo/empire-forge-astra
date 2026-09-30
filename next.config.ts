import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Several sibling projects share this parent directory; pin the trace
  // root so Next stops inferring the home folder from a stray lockfile.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
