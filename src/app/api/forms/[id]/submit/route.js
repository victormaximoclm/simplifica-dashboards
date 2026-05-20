export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/libs/auth'
import { getRequestId, logger } from '@/libs/logger'
import { prisma } from '@/libs/prisma'
import { createAuditLog } from '@/libs/auditService'
import { getUserFormContext } from '@/libs/formAccess'
import { canSubmitForm } from '@/libs/formPermissions'
import { claimPublicLinkForSubmit } from '@/libs/formlinkservice'

// POST /api/forms/[id]/submit - dispara webhook n8n
export async function POST(req, { params }) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  try {
    const { id } = await params
    const body = await req.json()
    const { data, fields: fieldsPayload, publicToken } = body
    const fields = fieldsPayload ?? data ?? {}

    const form = await prisma.form.findUnique({
      where: { id },
      include: { workspace: true }
    })

    if (!form) {
      const response = NextResponse.json({ message: 'Formulário não encontrado' }, { status: 404 })
      response.headers.set('x-request-id', requestId)
      return response
    }

    let isPublicSubmission = false
    let publicLinkId = null
    let submitCtx = null

    if (publicToken) {
      if (!form.allowPublicLink) {
        const response = NextResponse.json({ message: 'Links públicos não habilitados' }, { status: 403 })
        response.headers.set('x-request-id', requestId)
        return response
      }

      const claimed = await claimPublicLinkForSubmit({ token: publicToken, formId: id })

      if (!claimed) {
        const existing = await prisma.formPublicLink.findUnique({
          where: { token: publicToken },
          select: { used: true, expiresAt: true, formId: true }
        })

        if (!existing || existing.formId !== id) {
          const response = NextResponse.json({ message: 'Token inválido' }, { status: 403 })
          response.headers.set('x-request-id', requestId)
          return response
        }

        const message = existing.used
          ? 'Link já utilizado. Não é possível enviar outra resposta.'
          : 'Link expirado. Não é possível enviar respostas.'

        const response = NextResponse.json({ message }, { status: 403 })
        response.headers.set('x-request-id', requestId)
        return response
      }

      const publicLink = await prisma.formPublicLink.findUnique({
        where: { token: publicToken },
        select: { id: true }
      })

      isPublicSubmission = true
      publicLinkId = publicLink?.id ?? null
    } else {
      if (!session) {
        const response = NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
        response.headers.set('x-request-id', requestId)
        return response
      }

      submitCtx = await getUserFormContext(session.user.id)

      if (!canSubmitForm(session, form, submitCtx)) {
        const response = NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
        response.headers.set('x-request-id', requestId)
        return response
      }
    }

    const webhookPayload = {
      formId: form.id,
      formTitle: form.title,
      submittedAt: new Date().toISOString(),
      submittedBy: session
        ? {
            id: session.user.id,
            name: session.user.name ?? null,
            email: session.user.email ?? null,
            cargo: submitCtx?.cargo ?? null,
            workspaceId: session.user.workspaceId ?? submitCtx?.workspaceId ?? form.workspaceId
          }
        : null,
      fields
    }

    const webhookResponse = await fetch(form.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.N8N_API_KEY}` },
      body: JSON.stringify(webhookPayload)
    })

    if (!webhookResponse.ok) {
      logger.error('webhook-error', { requestId, formId: id, status: webhookResponse.status })
      const response = NextResponse.json({ message: 'Erro ao enviar dados' }, { status: 500 })
      response.headers.set('x-request-id', requestId)
      return response
    }

    if (session) {
      await createAuditLog({
        userId: session.user.id,
        tenantId: form.workspaceId,
        action: 'FORM_SUBMIT',
        entityType: 'form',
        entityId: id,
        after: { isPublicSubmission, publicLinkId },
        metadata: { requestId }
      })
    }

    logger.info('form-submit-success', { requestId, formId: id, isPublicSubmission })

    const response = NextResponse.json({ message: 'Formulário enviado com sucesso' })
    response.headers.set('x-request-id', requestId)
    return response
  } catch (error) {
    logger.error('form-submit-error', { requestId, error: error.message })
    const response = NextResponse.json({ message: 'Erro ao enviar formulário' }, { status: 500 })
    response.headers.set('x-request-id', requestId)
    return response
  }
}
