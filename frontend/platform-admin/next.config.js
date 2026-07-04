/** @type {import('next').NextConfig} */
module.exports = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@xfos/contracts-enums', '@xfos/contracts-bff-platform-admin'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};
