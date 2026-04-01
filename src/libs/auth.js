// Third-party Imports
import CredentialProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import { PrismaAdapter } from '@auth/prisma-adapter'

import { prisma } from '@/libs/prisma'

export const authOptions = {
  adapter: PrismaAdapter(prisma),

  // ** Configure one or more authentication providers
  // ** Please refer to https://next-auth.js.org/configuration/options#providers for more `providers` options
  providers: [
    CredentialProvider({
      // ** The name to display on the sign in form (e.g. 'Sign in with...')
      // ** For more details on Credentials Provider, visit https://next-auth.js.org/providers/credentials
      name: 'Credentials',
      type: 'credentials',

      /*
       * As we are using our own Sign-in page, we do not need to change
       * username or password attributes manually in following credentials object.
       */
      credentials: {},
      async authorize(credentials) {
        /*
         * You need to provide your own logic here that takes the credentials submitted and returns either
         * an object representing a user or value that is false/null if the credentials are invalid.
         * For e.g. return { id: 1, name: 'J Smith', email: 'jsmith@example.com' }
         * You can also use the `req` object to obtain additional parameters (i.e., the request IP address)
         */
        const { email, password } = credentials

        try {
          // ** Login API Call to match the user credentials and receive user data in response along with his role
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
            /*
             * Please unset all the sensitive information of the user either from API response or before returning
             * user data below. Below return statement will set the user object in the token and the same is set in
             * the session which will be accessible all over the app.
             */
            const safeUser = data?.user ?? data

            // Keep credentials payload minimal to avoid oversized JWT cookies.
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
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET
    })

    // ** ...add more providers here
  ],

  // ** Please refer to https://next-auth.js.org/configuration/options#session for more `session` options
  session: {
    /*
     * Choose how you want to save the user session.
     * The default is `jwt`, an encrypted JWT (JWE) stored in the session cookie.
     * If you use an `adapter` however, NextAuth default it to `database` instead.
     * You can still force a JWT session by explicitly defining `jwt`.
     * When using `database`, the session cookie will only contain a `sessionToken` value,
     * which is used to look up the session in the database.
     * If you use a custom credentials provider, user accounts will not be persisted in a database by NextAuth.js (even if one is configured).
     * The option to use JSON Web Tokens for session tokens must be enabled to use a custom credentials provider.
     */
    strategy: 'jwt',

    // ** Seconds - How long until an idle session expires and is no longer valid
    maxAge: 30 * 24 * 60 * 60 // ** 30 days
  },

  // ** Please refer to https://next-auth.js.org/configuration/options#pages for more `pages` options
  pages: {
    signIn: '/login'
  },

  // ** Please refer to https://next-auth.js.org/configuration/options#callbacks for more `callbacks` options
  callbacks: {
    /*
     * While using `jwt` as a strategy, `jwt()` callback will be called before
     * the `session()` callback. So we have to add custom parameters in `token`
     * via `jwt()` callback to make them accessible in the `session()` callback
     */
    async jwt({ token, user, trigger, session: updatedSession }) {
      if (user) {
        // Rebuild token with only required fields to keep cookie size under proxy limits.
        // NEVER store image/picture here — base64 avatars would exceed cookie size limits (431 error).
        return {
          sub: user.id ? String(user.id) : token.sub,
          id: user.id ?? null,
          name: user.name ?? null,
          email: user.email ?? null,
          role: user.role ?? null,
          workspaceId: user.workspaceId ?? null
        }
      }

      // When updateSession() is called from the client, merge the new data into the token
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
        // ** Add custom params to user in session which are added in `jwt()` callback via `token` parameter
        session.user.id = token.id || token.sub
        session.user.name = token.name
        session.user.role = token.role
        session.user.workspaceId = token.workspaceId

        // Fetch image from DB on each session call — never store in JWT to avoid oversized cookies
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
