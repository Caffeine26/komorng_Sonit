/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'scontent.fpnh10-1.fna.fbcdn.net' },
      { protocol: 'https', hostname: '*.fbcdn.net' },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        // Use environment variable for production, fallback to 127.0.0.1 for local dev
        destination: `${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:4000'}/api/v1/:path*`,
      },
      {
        // Proxy MinIO/S3 media URLs (logos, images) through the Next.js server
        source: '/xfos-media/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:9000'}/xfos-media/:path*`,
      },
    ];
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Keep your existing i18n and other configs below...
};

const withNextIntl = require('next-intl/plugin')();
module.exports = withNextIntl(nextConfig);
