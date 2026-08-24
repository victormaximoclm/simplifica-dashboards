// Component Imports
import UserList from '@views/apps/user/list'
import AdminGuard from '@/hocs/AdminGuard'
import NotAuthorized from '@views/NotAuthorized'

// Next-Auth Imports
import { getServerSession } from 'next-auth'
import { authOptions } from '@/libs/auth'

// Data Imports
import { getUserData, getWorkspaces, getUserStats } from '@/app/server/actions'
import { prisma } from '@/libs/prisma'

const getUserUsage = async workspaceId => {
  if (!workspaceId) return null

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: { plan: true }
  })

  if (!workspace) return null

  const count = await prisma.user.count({
    where: { workspaceId, status: { in: ['active', 'pending'] } }
  })

  return {
    count,
    limit: workspace.plan?.maxUsers === -1 ? Infinity : (workspace.plan?.maxUsers ?? 0) + workspace.extraUserSlots,
    planName: workspace.plan?.name ?? 'Sem plano'
  }
}

const UserListApp = async () => {
  const session = await getServerSession(authOptions)

  const [data, workspaces, stats, userUsage] = await Promise.all([
    getUserData(),
    getWorkspaces(),
    getUserStats(),
    getUserUsage(session?.user?.workspaceId)
  ])

  return (
    <AdminGuard fallback={<NotAuthorized />}>
      <UserList userData={data} workspaces={workspaces} stats={stats} userUsage={userUsage} />
    </AdminGuard>
  )
}

export default UserListApp
