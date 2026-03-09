import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Webpack config (used when Turbopack is NOT active)
  webpack: (config) => {
    // pdf-parse tries to read a test file at import time; this prevents the error
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    return config;
  },
  // Turbopack config (used in Next.js 16+ builds)
  turbopack: {
    resolveAlias: {
      canvas: path.resolve("./src/empty-module.js"),
    },
  },
};

export default nextConfig;
