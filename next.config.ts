import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  // Lets a phone on the LAN open the dev server.
  allowedDevOrigins: ["192.168.1.5"],
};

export default nextConfig;
