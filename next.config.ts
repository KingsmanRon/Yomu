import type { NextConfig } from "next";
import { execSync } from "node:child_process";

// One identifier per build. It versions the service worker and is reported in
// error logs so problems can be traced to a release.
function resolveBuildId(): string {
  if (process.env.YOMU_BUILD_ID) return process.env.YOMU_BUILD_ID;
  let sha = "local";
  try {
    sha = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    // Not a git checkout (for example a tarball deploy): fall back to "local".
  }
  return `${sha}-${Date.now().toString(36)}`;
}

const buildId = resolveBuildId();

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Microphone and camera are requested only after a spoken explanation
  // (microphone for self-check practice, camera for scanning a class QR code).
  { key: "Permissions-Policy", value: "microphone=(self), camera=(self), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  generateBuildId: async () => buildId,
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // Audio, images and fonts are content-hashed or versioned by path.
        source: "/(audio|images)/(.*)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/content/(.*)",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
