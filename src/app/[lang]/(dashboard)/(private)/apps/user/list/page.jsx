// Component Imports
import UserList from '@views/apps/user/list'
import AdminGuard from '@/hocs/AdminGuard'
import NotAuthorized from '@views/NotAuthorized'

// Data Imports
import { getUserData, getWorkspaces, getUserStats } from '@/app/server/actions'

const UserListApp = async () => {
  // Vars
  const [data, workspaces, stats] = await Promise.all([getUserData(), getWorkspaces(), getUserStats()])

  return (
    <AdminGuard fallback={<NotAuthorized />}>
      <UserList userData={data} workspaces={workspaces} stats={stats} />
    </AdminGuard>
  )
}

export default UserListApp
