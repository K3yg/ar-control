import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Permite abrir o servidor de dev pelo celular na rede local.
  allowedDevOrigins: ["192.168.1.5"],
};

export default nextConfig;
