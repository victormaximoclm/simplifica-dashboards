export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/libs/auth'
import { getRequestId, logger } from '@/libs/logger'
import { isSuperOnly } from '@/utils/roleHelpers'
import { prisma } from '@/libs/prisma'
import { createAuditLog } from '@/libs/auditService'
import { revokePublicLink } from '@/libs/formlinkservice'

// DELETE /api/forms/[id]/links/[linkId] - desativa um link público
export async function DELETE(req, { params }) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  const respond = (body, status) => {
    const response = NextResponse.json(body, { status })
    response.headers.set('x-request-id', requestId)
    return response
  }

  if (!session) return respond({ message: 'Não autorizado' }, 401)

  try {
    const { id, linkId } = await params
    const role = session.user.role

    // Desativar links é restrito ao SuperAdmin
    if (!isSuperOnly(role)) return respond({ message: 'Apenas SuperAdmin pode desativar links' }, 403)

    const link = await prisma.formPublicLink.findUnique({
      where: { id: linkId },
      include: { form: true }
    })

    if (!link || link.formId !== id) return respond({ message: 'Link não encontrado' }, 404)

    if (link.revokedAt) return respond(link, 200)

    const revoked = await revokePublicLink(linkId)

    await createAuditLog({
      userId: session.user.id,
      tenantId: link.form.workspaceId,
      action: 'FORM_LINK_REVOKE',
      entityType: 'form',
      entityId: id,
      after: { linkId, permanent: link.permanent },
      metadata: { requestId }
    })

    return respond(revoked, 200)
  } catch (error) {
    logger.error('form-link-revoke-error', { requestId, error: error.message })
    return respond({ message: 'Erro ao desativar link' }, 500)
  }
}
