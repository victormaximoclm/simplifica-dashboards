export const runtime = 'nodejs'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { getRequestId, jsonWithRequestId, logger } from '@/libs/logger'
import { isPreviewableMime } from '@/libs/documentFileTypes'
import {
  DocumentNoContentError,
  getAuthorizedDocumentItem,
  recordDocumentFileAccess,
  streamDocumentFile,
  withDocumentErrorHandling
} from '@/libs/documentAccess'

// GET /api/documents/files/:id/preview - exibe inline (somente PDF e imagens)
async function handleGet(req, { params }) {
  const { id } = await params
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)
  const access = await getAuthorizedDocumentItem({ kind: 'file', id, session, action: 'view' })

  if (!access.ok) {
    logger.warn('document-file-preview-denied', { requestId, fileId: id, status: access.status })

    return jsonWithRequestId({ message: access.message }, { status: access.status, requestId })
  }

  const file = access.item

  if (!isPreviewableMime(file.mimeType)) {
    return jsonWithRequestId(
      { message: 'Pré-visualização disponível apenas para PDF e imagens' },
      { status: 415, requestId }
    )
  }

  let response

  try {
    response = await streamDocumentFile({ file, disposition: 'inline', requestId })
  } catch (error) {
    if (error instanceof DocumentNoContentError) throw error

    logger.error('document-file-preview-error', { requestId, fileId: id, error: error.message })

    return jsonWithRequestId({ message: 'Arquivo não encontrado no armazenamento' }, { status: 404, requestId })
  }

  await recordDocumentFileAccess({ session, file, kind: 'view', requestId })

  return response
}

export const GET = withDocumentErrorHandling('document-file-preview-unhandled-error', handleGet)
