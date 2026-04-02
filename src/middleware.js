import { NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

// Rotas públicas (após remover prefixo /br|en|fr|ar). Mantém setup, convites e APIs sem sessão funcionando.
const publicRoutes = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/setup',
  '/accept-invite',
  '/api/auth',
  '/api/login',
  '/api/setup',
  '/api/health',
  '/api/apps/users/accept-invite',
  '/api/auth/forgot-password',
  '/api/auth/reset-password'
]

const langPrefixRegex = /^\/(br|en|fr|ar)(\/|$)/

function normalizePath(pathname) {
  return pathname.replace(langPrefixRegex, '/')
}

function loginRedirectUrl(request) {
  const url = request.nextUrl.clone()
  const bp = request.nextUrl.basePath || ''
  url.pathname = (bp + '/login').replace(/\/+/g, '/') || '/login'
  url.search = ''
  return url
}

export async function middleware(req) {
  const { pathname } = req.nextUrl
  const normalizedPath = normalizePath(pathname)

  if (publicRoutes.some(route => normalizedPath === route || normalizedPath.startsWith(`${route}/`))) {
    return NextResponse.next()
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token || !token.id) {
    return NextResponse.redirect(loginRedirectUrl(req))
  }

  // Status do usuário é validado em AuthGuard (Node) e nas APIs — Prisma não roda no Edge do middleware.
  return NextResponse.next()
}

// Ignora _next, favicon, pasta images/ e arquivos estáticos comuns em public/ (evita 302 em .svg/.woff etc.).
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|images/|.*\\.(?:ico|png|jpg|jpeg|gif|svg|webp|woff2?|ttf|eot|txt|xml)$).*)'
  ]
}
