// Component Imports
import UserList from '@views/apps/user/list'

// Data Imports
import { getUserData, getWorkspaces, getUserStats } from '@/app/server/actions'

const UserListApp = async () => {
  // Vars
  const [data, workspaces, stats] = await Promise.all([getUserData(), getWorkspaces(), getUserStats()])

  return <UserList userData={data} workspaces={workspaces} stats={stats} />
}

export default UserListApp
