import { redirect } from 'next/navigation'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { isHighAdmin } from '@/utils/roleHelpers'
import { canCreateDocuments, canDeleteDocuments, canEditDocuments } from '@/libs/documentPermissions'
import { getMaxFileSizeMb } from '@/libs/documentAccess'
import DocumentsView from '@/views/documents/DocumentsView'

const DocumentsPage = async ({ params, searchParams }) => {
  const { lang } = await params
  const { folder } = await searchParams
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect(`/${lang}/login`)
  }

  return (
    <DocumentsView
      initialFolderId={typeof folder === 'string' && folder ? folder : null}
      canCreate={canCreateDocuments(session.user)}
      canEdit={canEditDocuments(session.user)}
      canDelete={canDeleteDocuments(session.user)}
      maxFileSizeMb={getMaxFileSizeMb()}
      sendActiveWorkspace={isHighAdmin(session.user.role)}
    />
  )
}

export default DocumentsPage
