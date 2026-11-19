import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  // Phones on your Wi-Fi hitting `next dev`: DEV_ORIGINS=192.168.1.20,other-host
  allowedDevOrigins: process.env.DEV_ORIGINS?.split(",").filter(Boolean) ?? [],
};

export default nextConfig;
