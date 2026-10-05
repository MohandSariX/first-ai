import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit"],
  distDir: process.env.FIRST_AI_E2E === "true" ? ".next-e2e" : ".next",
  allowedDevOrigins: ["127.0.0.1"],
  transpilePackages: [
    "@first-ai/agents",
    "@first-ai/auth",
    "@first-ai/database",
    "@first-ai/schemas",
    "@first-ai/tools",
    "@first-ai/ui",
  ],
  webpack(config) {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
