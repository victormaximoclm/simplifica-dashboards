/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: process.env.BASEPATH || undefined,
  output: 'standalone',
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
        source: '/:path((?!br|en|fr|ar|front-pages|images|api|favicon.ico).*)*',
        destination: '/br/:path*',
        permanent: false,
        locale: false
      }
    ]
  }
}
export default nextConfig
