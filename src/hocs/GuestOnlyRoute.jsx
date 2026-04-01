// Next Imports
import { redirect } from 'next/navigation'

// Third-party Imports
import { getServerSession } from 'next-auth'

// Config Imports
import themeConfig from '@configs/themeConfig'
import { authOptions } from '@/libs/auth'

// Util Imports
import { getLocalizedUrl } from '@/utils/i18n'
import { prisma } from '@/libs/prisma'

const GuestOnlyRoute = async ({ children, lang }) => {
  // If no users exist, redirect to initial setup
  const userCount = await prisma.user.count()

  if (userCount === 0) {
    redirect(getLocalizedUrl('/setup', lang))
  }

  const session = await getServerSession(authOptions)

  if (session) {
    redirect(getLocalizedUrl(themeConfig.homePageUrl, lang))
  }

  return <>{children}</>
}

export default GuestOnlyRoute
