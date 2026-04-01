// Third-party Imports
import { redirect } from 'next/navigation'

import { cookies } from 'next/headers'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { isHighAdmin } from '@/utils/roleHelpers'
import { prisma } from '@/libs/prisma'

const DashboardHome = async ({ params }) => {
  const { lang } = await params
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect(`/${lang}/login`)
  }

  const userRole = session.user.role
  let where = {}

  if (isHighAdmin(userRole)) {
    // High admins: filter by active workspace from cookie, or default to first workspace
    const cookieStore = await cookies()
    const activeWsId = cookieStore.get('activeWorkspaceId')?.value

    if (activeWsId) {
      where = { workspaceId: activeWsId }
    } else {
      // No active workspace yet — use first workspace available
      const firstWorkspace = await prisma.workspace.findFirst({ orderBy: { name: 'asc' } })

      if (firstWorkspace) {
        where = { workspaceId: firstWorkspace.id }
      }
    }
  } else if (userRole === 'admin') {
    where = { workspaceId: session.user.workspaceId }
  } else {
    where = { workspaceId: session.user.workspaceId }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { customRoleId: true }
    })

    if (user?.customRoleId) {
      where.allowedRoles = { some: { customRoleId: user.customRoleId } }
    } else {
      return <EmptyState />
    }
  }

  const firstDashboard = await prisma.dashboard.findFirst({
    where,
    orderBy: { createdAt: 'asc' },
    select: { id: true }
  })

  if (firstDashboard) {
    redirect(`/${lang}/dashboards/view/${firstDashboard.id}`)
  }

  return <EmptyState />
}

const EmptyState = () => (
  <div className='flex flex-col items-center justify-center min-h-[60vh] gap-4'>
    <i className='tabler-chart-bar-off text-6xl text-textDisabled' />
    <h4 className='text-xl font-medium text-textPrimary'>Nenhum dashboard disponível</h4>
    <p className='text-textSecondary text-center max-w-md'>
      Não há dashboards configurados para o seu espaço de trabalho. Entre em contato com o administrador para solicitar
      acesso.
    </p>
  </div>
)

export default DashboardHome
