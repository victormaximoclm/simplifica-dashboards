// Third-party Imports
import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { isHighAdmin } from '@/utils/roleHelpers'
import { canShareForms } from '@/libs/formPermissions'
import { prisma } from '@/libs/prisma'
/**
 * SuperAdminGuard - Server component that restricts access to superAdmin and subAdmin roles.
 * Renders children only if the user has a high admin role (superAdmin or subAdmin).
 * Otherwise renders a fallback (or nothing).
 *
 *
 */

export default async function SuperAdminGuard({ children, fallback = null }) {
  const session = await getServerSession(authOptions)

  const user = await prisma.user.findUnique({
    where: {
      id: session.user.id
    },
    include: {
      adminPermissions: true
    }
  })

  if (!session || (!isHighAdmin(session.user.role) && !canShareForms(user.adminPermissions))) {
    return <>{fallback}</>
  }

  return <>{children}</>
}
