import DocumentsExplorer from '@/components/documents/DocumentsExplorer'
import AdminGuard from '@/hocs/AdminGuard'
import NotAuthorized from '@views/NotAuthorized'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/libs/auth'
import { prisma } from '@/libs/prisma'

const getRootFolders = async workspaceId => {
  if (!workspaceId) return []
  return prisma.folder.findMany({
    where: { workspaceId, parentId: null },
    include: { _count: { select: { children: true, documents: true } } },
    orderBy: { name: 'asc' }
  })
}

const DocumentsPage = async () => {
  const session = await getServerSession(authOptions)
  const folders = await getRootFolders(session?.user?.workspaceId)

  return (
    <AdminGuard fallback={<NotAuthorized />}>
      <DocumentsExplorer initialFolders={folders} workspaceId={session?.user?.workspaceId} canManage />
    </AdminGuard>
  )
}

export default DocumentsPage
