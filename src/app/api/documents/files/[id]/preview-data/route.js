export const runtime = 'nodejs'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { getRequestId, jsonWithRequestId, logger } from '@/libs/logger'
import { isPreviewableMime } from '@/libs/documentFileTypes'
import { buildDocumentPreview, hasStructuredPreview, isPreviewError } from '@/libs/documentPreview'
import {
  getAuthorizedDocumentItem,
  readDocumentBuffer,
  recordDocumentFileAccess,
  withDocumentErrorHandling
} from '@/libs/documentAccess'

// GET /api/documents/files/:id/preview-data - pré-visualização estruturada (txt, csv, docx, xlsx, pptx, zip)
async function handleGet(req, { params }) {
  const { id } = await params
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)
  const access = await getAuthorizedDocumentItem({ kind: 'file', id, session, action: 'view' })

  if (!access.ok) {
    logger.warn('document-file-preview-data-denied', { requestId, fileId: id, status: access.status })

    return jsonWithRequestId({ message: access.message }, { status: access.status, requestId })
  }

  const file = access.item

  if (isPreviewableMime(file.mimeType) || !hasStructuredPreview(file.name)) {
    return jsonWithRequestId(
      { message: 'Este tipo de arquivo é exibido diretamente pela rota de pré-visualização' },
      { status: 415, requestId }
    )
  }

  let buffer

  try {
    buffer = await readDocumentBuffer(file)
  } catch (error) {
    logger.error('document-file-preview-data-read-error', { requestId, fileId: id, error: error.message })

    return jsonWithRequestId({ message: 'Arquivo não encontrado no armazenamento' }, { status: 404, requestId })
  }

  let preview

  try {
    preview = buildDocumentPreview({ name: file.name, buffer })
  } catch (error) {
    // Arquivo malformado, grande demais ou formato não suportado: 422 com mensagem para o usuário
    const expected = isPreviewError(error)

    logger[expected ? 'warn' : 'error']('document-file-preview-data-failed', {
      requestId,
      fileId: id,
      error: error.message
    })

    return jsonWithRequestId(
      {
        message: expected
          ? `Não foi possível pré-visualizar: ${error.message}`
          : 'Não foi possível pré-visualizar este arquivo. Baixe para abri-lo.'
      },
      { status: 422, requestId }
    )
  }

  await recordDocumentFileAccess({ session, file, kind: 'view', requestId })

  return jsonWithRequestId(preview, { requestId, headers: { 'Cache-Control': 'private, no-store' } })
}

export const GET = withDocumentErrorHandling('document-file-preview-data-unhandled-error', handleGet)
