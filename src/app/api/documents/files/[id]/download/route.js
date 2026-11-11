export const runtime = 'nodejs'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { getRequestId, jsonWithRequestId, logger } from '@/libs/logger'
import {
  DocumentNoContentError,
  getAuthorizedDocumentItem,
  recordDocumentFileAccess,
  streamDocumentFile,
  withDocumentErrorHandling
} from '@/libs/documentAccess'

// GET /api/documents/files/:id/download - baixa o arquivo (todos os perfis com acesso ao workspace)
async function handleGet(req, { params }) {
  const { id } = await params
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)
  const access = await getAuthorizedDocumentItem({ kind: 'file', id, session, action: 'view' })

  if (!access.ok) {
    logger.warn('document-file-download-denied', { requestId, fileId: id, status: access.status })

    return jsonWithRequestId({ message: access.message }, { status: access.status, requestId })
  }

  const file = access.item
  let response

  try {
    response = await streamDocumentFile({ file, disposition: 'attachment', requestId })
  } catch (error) {
    // Item sem blob (Site): 415 pelo withDocumentErrorHandling, não "não encontrado no armazenamento"
    if (error instanceof DocumentNoContentError) throw error

    logger.error('document-file-download-error', { requestId, fileId: id, error: error.message })

    return jsonWithRequestId({ message: 'Arquivo não encontrado no armazenamento' }, { status: 404, requestId })
  }

  logger.info('document-file-download-success', { requestId, userId: session.user.id, fileId: id })
  await recordDocumentFileAccess({ session, file, kind: 'download', requestId })

  return response
}

export const GET = withDocumentErrorHandling('document-file-download-unhandled-error', handleGet)
