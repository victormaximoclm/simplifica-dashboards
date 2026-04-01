import SuperAdminGuard from '@/hocs/SuperAdminGuard'
import DashboardManage from '@/views/dashboards/DashboardManage'
import { prisma } from '@/libs/prisma'

const DashboardManagePage = async () => {
  const workspaces = await prisma.workspace.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' }
  })

  return (
    <SuperAdminGuard>
      <DashboardManage workspaces={workspaces} />
    </SuperAdminGuard>
  )
}

export default DashboardManagePage
