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

// O n8n pode demorar (fluxos que só respondem no fim); sem limite, uma conexão travada nunca vira registro
const WEBHOOK_TIMEOUT_MS = 60_000

// Um registro de "muitos envios" por formulário a cada 5 min: um bloqueio em massa não enche a auditoria
const RATE_LIMIT_AUDIT_WINDOW_MS = 5 * 60_000

const LINK_REJECTION_MESSAGES = {
  link_revoked: 'Link desativado. Não é possível enviar respostas.',
  link_already_used: 'Link já utilizado. Não é possível enviar outra resposta.',
  link_expired: 'Link expirado. Não é possível enviar respostas.'
}

/**
 * Todo envio vira um registro no AuditLog, com sucesso ou não:
 * - FORM_SUBMIT: chegou ao n8n
 * - FORM_SUBMIT_REJECTED: recusado pelo pedido (link, permissão, campos, limite de envios)
 * - FORM_SUBMIT_FAILED: o sistema falhou (n8n com erro, fora do ar, sem resposta, erro interno)
 * `after.reason` diz o motivo. Envio por link público fica com userId nulo e guarda só o id do link, nunca o token.
 */
// POST /api/forms/[id]/submit - dispara webhook n8n
export async function POST(req, { params }) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  let formId = null
  let form = null
  // null até ler o corpo: um bloqueio por limite ou um corpo ilegível não sabe se veio de link público
  let isPublic = null
  let publicLinkId = null

  const reply = (status, body) => {
    const response = NextResponse.json(body, { status })

    response.headers.set('x-request-id', requestId)

    return response
  }

  const audit = (action, after = {}) =>
    createAuditLog({
      userId: session?.user?.id ?? null,
      tenantId: form?.workspaceId ?? null,
      action,
      entityType: 'form',
      // O id vem da URL: num "formulário não encontrado" pode ser qualquer texto
      entityId: formId ? String(formId).slice(0, 100) : null,
      after: { ...after, isPublicSubmission: isPublic, publicLinkId },
      metadata: {
        requestId,
        name: form?.title ?? null,
        via: isPublic === null ? null : isPublic ? 'public_link' : 'session'
      }
    })

  const reject = async (status, message, reason, extra = {}) => {
    await audit('FORM_SUBMIT_REJECTED', { reason, message, ...extra })

    return reply(status, { message })
  }

  try {
    formId = (await params).id

    const rate = await submitLimiter.check(req)

    if (!rate.success) {
      logger.warn('form-submit-rate-limit', { requestId, formId })

      const alreadyLogged = await prisma.auditLog.findFirst({
        where: {
          action: 'FORM_SUBMIT_REJECTED',
          entityType: 'form',
          entityId: formId,
          createdAt: { gte: new Date(Date.now() - RATE_LIMIT_AUDIT_WINDOW_MS) },
          after: { path: ['reason'], equals: 'rate_limited' }
        },
        select: { id: true }
      })

      const message = 'Muitos envios em sequência. Aguarde um instante.'

      return alreadyLogged ? reply(429, { message }) : reject(429, message, 'rate_limited')
    }

    let body

    try {
      body = await req.json()
    } catch {
      return reject(400, 'Dados do formulário inválidos.', 'invalid_request')
    }

    const { data, fields: fieldsPayload, publicToken } = body ?? {}
    const fields = fieldsPayload ?? data ?? {}

    // Desde já: um envio recusado ou com falha também diz se veio de link público
    isPublic = Boolean(publicToken)

    form = await prisma.form.findUnique({ where: { id: formId }, include: { workspace: true } })

    if (!form) return reject(404, 'Formulário não encontrado', 'form_not_found')

    // Identifica o link antes de tudo (sem consumir): qualquer recusa ou falha depois já diz qual link foi usado
    const findLink = () =>
      prisma.formPublicLink.findUnique({
        where: { token: publicToken },
        select: { id: true, used: true, revokedAt: true, formId: true }
      })

    if (publicToken) {
      const link = await findLink()

      if (!link || link.formId !== formId) return reject(403, 'Token inválido', 'invalid_token')

      publicLinkId = link.id
    }

    // Só repassa ao n8n o que o formulário geraria: campos conhecidos, obrigatórios e regex conferidos
    const validation = validateSubmission(form.fields, fields)

    if (validation.error) {
      logger.warn('form-submit-invalid', { requestId, formId, reason: validation.error })

      return reject(400, validation.error, 'invalid_fields')
    }

    let submitCtx = null

    if (publicToken) {
      if (!form.allowPublicLink) return reject(403, 'Links públicos não habilitados', 'public_link_disabled')

      // Consome o link de uso único só agora, com os campos já válidos
      if (!(await claimPublicLinkForSubmit({ token: publicToken, formId }))) {
        // Estado lido depois do claim: cobre também outro envio que usou o link no mesmo instante
        const link = await findLink()
        const reason = link?.revokedAt ? 'link_revoked' : link?.used ? 'link_already_used' : 'link_expired'

        return reject(403, LINK_REJECTION_MESSAGES[reason], reason)
      }
    } else {
      if (!session) return reject(401, 'Não autorizado', 'not_authenticated')

      submitCtx = await getUserFormContext(session.user.id)

      if (!(await canSubmitForm(session, form, submitCtx))) return reject(403, 'Acesso negado', 'no_permission')
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
    const startedAt = Date.now()

    try {
      webhookResponse = await fetch(form.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.N8N_API_KEY}` },
        body: JSON.stringify(webhookPayload),
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS)
      })
    } catch (error) {
      // Sem resposta do n8n: tempo esgotado, endereço inexistente, conexão recusada, falha de rede do servidor
      const timedOut = error.name === 'TimeoutError'
      const errorCode = error.cause?.code ?? error.name ?? null

      logger.error('webhook-unreachable', { requestId, formId, timedOut, errorCode, error: error.message })

      await audit('FORM_SUBMIT_FAILED', {
        reason: timedOut ? 'webhook_timeout' : 'webhook_unreachable',
        webhookStatus: null,
        errorCode,
        durationMs: Date.now() - startedAt
      })

      return reply(502, { message: 'Erro ao enviar dados' })
    }

    if (!webhookResponse.ok) {
      const webhookError = await webhookResponse.text().catch(() => '')

      logger.error('webhook-error', { requestId, formId, status: webhookResponse.status })

      await audit('FORM_SUBMIT_FAILED', {
        reason: 'webhook_error',
        webhookStatus: webhookResponse.status,
        durationMs: Date.now() - startedAt
      })

      return reply(500, { message: 'Erro ao enviar dados', webhookMessage: webhookError })
    }

    await audit('FORM_SUBMIT', { durationMs: Date.now() - startedAt })

    logger.info('form-submit-success', { requestId, formId, isPublicSubmission: isPublic })

    return reply(200, { message: 'Formulário enviado com sucesso' })
  } catch (error) {
    logger.error('form-submit-error', { requestId, formId, error: error.message })

    // Erro inesperado (banco, código): o registro guarda a mensagem, sem pilha
    await audit('FORM_SUBMIT_FAILED', { reason: 'internal_error', error: String(error.message).slice(0, 300) })

    return reply(500, { message: 'Erro ao enviar formulário' })
  }
}
