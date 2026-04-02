// Third-party Imports
import CredentialProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import { PrismaAdapter } from '@auth/prisma-adapter'

import { prisma } from '@/libs/prisma'

const providers = [
  CredentialProvider({
    name: 'Credentials',
    type: 'credentials',
    credentials: {},
    async authorize(credentials) {
      const { email, password } = credentials

      try {
        const res = await fetch(`${process.env.API_URL}/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email, password })
        })

        const data = await res.json()

        if (res.status === 401) {
          throw new Error(data?.message?.[0] ?? 'Email ou senha inválidos')
        }

        if (res.status === 403) {
          throw new Error(data?.message?.[0] ?? 'Acesso negado')
        }

        if (res.status === 200) {
          const safeUser = data?.user ?? data

          return {
            id: safeUser?.id,
            name: safeUser?.name ?? null,
            email: safeUser?.email ?? null,
            role: safeUser?.role ?? null,
            workspaceId: safeUser?.workspaceId ?? null
          }
        }

        return null
      } catch (e) {
        throw new Error(e.message)
      }
    }
  })
]

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET
    })
  )
}

export const authOptions = {
  adapter: PrismaAdapter(prisma),

  providers,

  trustHost: true,

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60
  },

  pages: {
    signIn: '/login'
  },

  callbacks: {
    async jwt({ token, user, trigger, session: updatedSession }) {
      if (user) {
        return {
          sub: user.id ? String(user.id) : token.sub,
          id: user.id ?? null,
          name: user.name ?? null,
          email: user.email ?? null,
          role: user.role ?? null,
          workspaceId: user.workspaceId ?? null
        }
      }

      if (trigger === 'update' && updatedSession?.user) {
        const u = updatedSession.user

        if (u.name !== undefined) token.name = u.name
      }

      return {
        sub: token.sub,
        id: token.id ?? null,
        name: token.name ?? null,
        email: token.email ?? null,
        role: token.role ?? null,
        workspaceId: token.workspaceId ?? null
      }
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id || token.sub
        session.user.name = token.name
        session.user.role = token.role
        session.user.workspaceId = token.workspaceId

        const dbUser = await prisma.user.findUnique({
          where: { id: token.id || token.sub },
          select: { image: true }
        })

        session.user.image = dbUser?.image ?? null
      }

      return session
    }
  }
}
