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
  // If no users exist, redirect to initial setup
  const userCount = await prisma.user.count()

  if (userCount === 0) {
    redirect(getLocalizedUrl('/setup', locale))
  }

  const session = await getServerSession(authOptions)

  return <>{session ? children : <AuthRedirect lang={locale} />}</>
}
