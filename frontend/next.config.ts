import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Prevent Next.js from walking up to a stray lockfile in a parent directory
  // and misidentifying it as the workspace root (breaks React Client Manifest on Windows).
  // Setting this to __dirname (the frontend dir) is safe on both local and Vercel.
  outputFileTracingRoot: __dirname,
  /* config options here */
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            // Deny microphone globally; overridden below for the voice app pages
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
      {
        // Allow microphone only on the voice assistant pages (not /admin)
        source: '/((?!admin).*)',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(self), geolocation=(), interest-cohort=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
