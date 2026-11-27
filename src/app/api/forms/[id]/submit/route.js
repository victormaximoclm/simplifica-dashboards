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
import { validateSubmission } from '@/libs/formSanitize'
import { createRateLimit } from '@/libs/rateLimit'

const submitLimiter = createRateLimit({ interval: 60_000, limit: 30 })

/**
 * Registra o envio no AuditLog. Envio por link público fica com userId nulo (a coluna aponta para User) e guarda só
 * o id do link, nunca o token.
 */
const auditSubmit = ({ action, session, form, requestId, isPublic, publicLinkId = null, after = {} }) =>
  createAuditLog({
    userId: session?.user?.id ?? null,
    tenantId: form.workspaceId,
    action,
    entityType: 'form',
    entityId: form.id,
    after: { ...after, isPublicSubmission: isPublic, publicLinkId },
    metadata: { requestId, name: form.title, via: isPublic ? 'public_link' : 'session' }
  })

// POST /api/forms/[id]/submit - dispara webhook n8n
export async function POST(req, { params }) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  try {
    const rate = await submitLimiter.check(req)

    if (!rate.success) {
      logger.warn('form-submit-rate-limit', { requestId })
      const response = NextResponse.json({ message: 'Muitos envios em sequência. Aguarde um instante.' }, { status: 429 })

      response.headers.set('x-request-id', requestId)
      
return response
    }

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

    // Só repassa ao n8n o que o formulário geraria: campos conhecidos, obrigatórios e regex conferidos
    const validation = validateSubmission(form.fields, fields)

    if (validation.error) {
      logger.warn('form-submit-invalid', { requestId, formId: id, reason: validation.error })
      const response = NextResponse.json({ message: validation.error }, { status: 400 })

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
          select: { id: true, used: true, revokedAt: true, expiresAt: true, formId: true }
        })

        if (!existing || existing.formId !== id) {
          await auditSubmit({
            action: 'FORM_SUBMIT_REJECTED',
            session,
            form,
            requestId,
            isPublic: true,
            after: { reason: 'invalid_token' }
          })

          const response = NextResponse.json({ message: 'Token inválido' }, { status: 403 })

          response.headers.set('x-request-id', requestId)
          
return response
        }

        const reason = existing.revokedAt ? 'link_revoked' : existing.used ? 'link_already_used' : 'link_expired'

        const message = {
          link_revoked: 'Link desativado. Não é possível enviar respostas.',
          link_already_used: 'Link já utilizado. Não é possível enviar outra resposta.',
          link_expired: 'Link expirado. Não é possível enviar respostas.'
        }[reason]

        await auditSubmit({
          action: 'FORM_SUBMIT_REJECTED',
          session,
          form,
          requestId,
          isPublic: true,
          publicLinkId: existing.id,
          after: { reason }
        })

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

      const canSubmit = await canSubmitForm(session, form, submitCtx)

      if (!canSubmit) {
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
      fields: validation.fields
    }

    let webhookResponse

    try {
      webhookResponse = await fetch(form.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.N8N_API_KEY}` },
        body: JSON.stringify(webhookPayload)
      })
    } catch (error) {
      // Webhook fora do ar ou endereço inválido: o envio falhou e precisa ficar no audit
      logger.error('webhook-unreachable', { requestId, formId: id, error: error.message })

      await auditSubmit({
        action: 'FORM_SUBMIT_FAILED',
        session,
        form,
        requestId,
        isPublic: isPublicSubmission,
        publicLinkId,
        after: { webhookStatus: null, reason: 'webhook_unreachable' }
      })

      const response = NextResponse.json({ message: 'Erro ao enviar dados' }, { status: 502 })

      response.headers.set('x-request-id', requestId)

      return response
    }

    if (!webhookResponse.ok) {
      const webhookError = await webhookResponse.text().catch(() => '')

      logger.error('webhook-error', { requestId, formId: id, status: webhookResponse.status })

      await auditSubmit({
        action: 'FORM_SUBMIT_FAILED',
        session,
        form,
        requestId,
        isPublic: isPublicSubmission,
        publicLinkId,
        after: { webhookStatus: webhookResponse.status }
      })

      const response = NextResponse.json(
        { message: 'Erro ao enviar dados', webhookMessage: webhookError },
        { status: 500 }
      )

      response.headers.set('x-request-id', requestId)
      
return response
    }

    await auditSubmit({
      action: 'FORM_SUBMIT',
      session,
      form,
      requestId,
      isPublic: isPublicSubmission,
      publicLinkId
    })

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
