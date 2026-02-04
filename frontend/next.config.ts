import type { NextConfig } from "next";

// Dev DX: silence lockfile root warning and LAN CORS in dev
const nextConfig: NextConfig = {
  reactCompiler: true,
  // When developing from another device/IP, allow fetching _next assets
  // See: allowedDevOrigins in Next.js config
  allowedDevOrigins: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    // LAN origin observed in your logs
    "http://192.168.1.5:3000",
  ],
  // Ensure Turbopack treats this folder as the workspace root
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
