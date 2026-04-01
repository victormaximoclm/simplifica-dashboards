// Component Imports
import WorkspaceList from '@views/apps/workspaces'

// HOC Imports
import SuperAdminGuard from '@/hocs/SuperAdminGuard'

// Data Imports
import { getWorkspaces } from '@/app/server/actions'

// Component Imports
import NotAuthorized from '@views/NotAuthorized'

const WorkspacesPage = async () => {
  const workspaces = await getWorkspaces()

  return (
    <SuperAdminGuard fallback={<NotAuthorized />}>
      <WorkspaceList workspaces={workspaces} />
    </SuperAdminGuard>
  )
}

export default WorkspacesPage
