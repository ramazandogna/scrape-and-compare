import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Proxy API requests to NestJS backend — eliminates CORS issues in development */
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:3000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
