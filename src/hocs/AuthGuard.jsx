// Next Imports
import { redirect } from 'next/navigation'

// Third-party Imports
import { getServerSession } from 'next-auth'

// Component Imports
import AuthRedirect from '@/components/AuthRedirect'
import { authOptions } from '@/libs/auth'

// Util Imports
import { getLocalizedUrl } from '@/utils/i18n'
import { prisma } from '@/libs/prisma'

export default async function AuthGuard({ children, locale }) {
  // Se não há usuários, fluxo vai para configuração inicial (servidor Node — Prisma ok).
  const userCount = await prisma.user.count()

  if (userCount === 0) {
    redirect(getLocalizedUrl('/setup', locale))
  }

  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return <AuthRedirect lang={locale} />
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { status: true }
  })

  if (!dbUser) {
    redirect(`${getLocalizedUrl('/login', locale)}?error=${encodeURIComponent('Sua conta foi removida. Faça login novamente ou contate o administrador.')}`)
  }

  if (dbUser.status === 'inactive') {
    redirect(`${getLocalizedUrl('/login', locale)}?error=${encodeURIComponent('Sua conta foi inativada. Faça login novamente ou contate o administrador.')}`)
  }

  return <>{children}</>
}
