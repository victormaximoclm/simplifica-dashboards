// Third-party Imports
import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { isHighAdmin } from '@/utils/roleHelpers'

/**
 * SuperAdminGuard - Server component that restricts access to superAdmin and subAdmin roles.
 * Renders children only if the user has a high admin role (superAdmin or subAdmin).
 * Otherwise renders a fallback (or nothing).
 */
export default async function SuperAdminGuard({ children, fallback = null }) {
  const session = await getServerSession(authOptions)

  if (!session || !isHighAdmin(session.user.role)) {
    return <>{fallback}</>
  }

  return <>{children}</>
}
