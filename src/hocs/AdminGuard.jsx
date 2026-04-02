// Third-party Imports
import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { isHighAdmin } from '@/utils/roleHelpers'

/**
 * AdminGuard - Server component that restricts access to superAdmin, subAdmin and admin roles.
 * Blocks regular users (role === 'user') from accessing the page.
 */
export default async function AdminGuard({ children, fallback = null }) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return <>{fallback}</>
  }

  const role = session.user.role

  if (!isHighAdmin(role) && role !== 'admin') {
    return <>{fallback}</>
  }

  return <>{children}</>
}
