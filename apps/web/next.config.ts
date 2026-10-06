import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Don't advertise the framework version in a response header.
  poweredByHeader: false,
};

export default config;
