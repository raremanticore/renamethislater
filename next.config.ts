import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    let backend: URL;
    try { backend = new URL(process.env.BACKEND_URL ?? 'http://127.0.0.1:3001'); }
    catch { throw new Error('BACKEND_URL must be a valid backend origin'); }
    if (!['http:', 'https:'].includes(backend.protocol) || backend.username || backend.password || backend.search || backend.hash || backend.pathname !== '/') {
      throw new Error('BACKEND_URL must be an HTTP(S) origin without credentials or a path');
    }
    return [{ source: '/api/:path*', destination: `${backend.origin}/api/:path*` }];
  },
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
