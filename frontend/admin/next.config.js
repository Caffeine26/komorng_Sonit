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
        // Use 127.0.0.1 instead of localhost to force IPv4 and avoid ECONNREFUSED
        destination: 'http://127.0.0.1:4000/api/v1/:path*',
      },
      {
        // Proxy MinIO/S3 media URLs (logos, images) through the Next.js server
        // so Safari never sees an http://localhost:9000 URL (mixed-content block)
        source: '/xfos-media/:path*',
        destination: 'http://127.0.0.1:9000/xfos-media/:path*',
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
