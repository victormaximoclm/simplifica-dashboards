import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/libs/auth'
import { prisma } from '@/libs/prisma'
import { getFolderPath } from '@/libs/documents'
import DocumentsExplorer from '@/components/documents/DocumentsExplorer'
import NotAuthorized from '@views/NotAuthorized'

const FolderPage = async ({ params }) => {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const isHighAdmin = ['superAdmin', 'subAdmin'].includes(session.user.role)

  const folder = await prisma.folder.findUnique({
    where: { id: params.folderId },
    include: {
      children: {
        orderBy: { name: 'asc' },
        include: { _count: { select: { children: true, documents: true } } }
      },
      documents: { orderBy: { createdAt: 'desc' } },
      allowedRoles: true
    }
  })

  if (!folder) return <NotAuthorized />

  const canView = isHighAdmin || folder.allowedRoles.some(r => r.customRoleId === session.user.customRoleId)
  if (!canView) return <NotAuthorized />

  const path = await getFolderPath(folder.id)

  return (
    <DocumentsExplorer
      currentFolder={{ ...folder, path }}
      initialFolders={folder.children}
      initialDocuments={folder.documents}
      canManage={isHighAdmin}
      canUpload={isHighAdmin}
    />
  )
}

export default FolderPage
