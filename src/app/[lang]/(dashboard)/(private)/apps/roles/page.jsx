import { getServerSession } from 'next-auth'
import { authOptions } from '@/libs/auth'
import { cookies } from 'next/headers'
import Roles from '@views/apps/roles'
import SuperAdminGuard from '@/hocs/SuperAdminGuard'
import NotAuthorized from '@views/NotAuthorized'

const RolesApp = async () => {
  const session = await getServerSession(authOptions)
  const isHighAdmin = ['superAdmin', 'subAdmin'].includes(session?.user?.role)

  const cookieStore = await cookies()
  const workspaceId = isHighAdmin
    ? (cookieStore.get('activeWorkspaceId')?.value ?? null)
    : (session?.user?.workspaceId ?? null)

  return (
    <SuperAdminGuard fallback={<NotAuthorized />}>
      <Roles workspaceId={workspaceId} />
    </SuperAdminGuard>
  )
}

export default RolesApp
