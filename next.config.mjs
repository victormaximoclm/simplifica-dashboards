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

  experimental: {
    // Com middleware ativo, o Next bufferiza o corpo das requisições e TRUNCA em silêncio acima deste limite
    // (padrão 10MB). Vale para TODAS as rotas. Cobre o upload de Documentos (DOCUMENTS_MAX_FILE_SIZE_MB, teto 50)
    // mais a folga do multipart; manter igual a DOCUMENTS_MAX_REQUEST_BYTES em src/libs/documentAccess.js.
    proxyClientMaxBodySize: '55mb'
  },

  images: {
    remotePatterns: [],
    formats: ['image/avif', 'image/webp']
  },

  headers: async () => [
    {
      source: '/',
      headers: securityHeaders
    },
    {
      source: '/:path((?!api/documents/files/).*)*',
      headers: securityHeaders
    },

    // Arquivos de Documentos definem a própria CSP (streamDocumentFile): o header daqui sobrescreveria o `sandbox`
    // dos documentos HTML
    {
      source: '/api/documents/files/:path*',
      headers: securityHeaders.filter(header => header.key !== 'Content-Security-Policy')
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
