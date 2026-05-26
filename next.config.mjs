/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()'
  }
]

const nextConfig = {
  basePath: process.env.BASEPATH || undefined,
  output: 'standalone',

  images: {
    remotePatterns: [],
    formats: ['image/avif', 'image/webp']
  },

  headers: async () => [
    {
      source: '/(.*)',
      headers: securityHeaders
    }
  ],

  redirects: async () => {
    return [
      {
        source: '/',
        destination: '/br/dashboards',
        permanent: false,
        locale: false
      },
      {
        source: '/:lang(br|en|fr|ar)',
        destination: '/:lang/dashboards',
        permanent: false,
        locale: false
      },
      {
        source: '/:path((?!br|en|fr|ar|front-pages|images|docs|api|favicon.ico).*)*',
        destination: '/br/:path*',
        permanent: false,
        locale: false
      }
    ]
  }
}
export default nextConfig
