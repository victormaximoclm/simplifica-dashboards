import { AsyncLocalStorage } from 'node:async_hooks'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { createAuditLog } from '@/libs/auditService'
import { getRequestId, jsonWithRequestId, logger } from '@/libs/logger'
import { prisma } from '@/libs/prisma'

/**
 * Registra no AuditLog toda ação que não deu certo, sem precisar de código em cada retorno de erro da rota:
 * - resposta 4xx -> <AÇÃO>_REJECTED (pedido recusado: dados inválidos, sem permissão, não encontrado, conflito)
 * - resposta 5xx ou exceção -> <AÇÃO>_FAILED (o sistema falhou); exceção vira um 500 padronizado
 * O sucesso continua sendo registrado pela própria rota. 401 (sem login) não entra: é sessão expirada, só ruído.
 *
 * Uso: export const POST = withActionAudit('DASHBOARD_CREATE', handlePost)
 * A ação pode ser uma função dos params da rota (ex.: depende do provedor da integração).
 */

const store = new AsyncLocalStorage()

/** Completa o registro de erro da requisição atual (workspace, nome, mensagem real de uma exceção tratada) */
export function setAuditContext(values) {
  const ctx = store.getStore()

  if (ctx) Object.assign(ctx, values)
}

// Tipo de recurso pelo prefixo da ação, na mesma convenção que as rotas usam no registro de sucesso
const ENTITY_BY_PREFIX = [
  ['DOCUMENT_FOLDER_', 'document_folder'],
  ['DOCUMENT_TEMPLATE_', 'document_html_template'],
  ['DOCUMENT_', 'document_file'],
  ['DASHBOARD_', 'dashboard'],
  ['WORKSPACE_', 'workspace'],
  ['CUSTOM_ROLE_', 'custom_role'],
  ['USER_', 'user'],
  ['FORM_', 'form'],
  ['INTEGRATION_', 'integration']
]

const entityTypeOf = action =>
  ENTITY_BY_PREFIX.find(([prefix]) => action.startsWith(prefix))?.[1] ??
  (action.includes('_INTEGRATION_') ? 'userIntegration' : 'unknown')

// Workspace do item, quando a rota não informou: o filtro por workspace também precisa achar os erros
const TENANT_LOOKUP = {
  dashboard: id => prisma.dashboard.findUnique({ where: { id }, select: { workspaceId: true } }),
  form: id => prisma.form.findUnique({ where: { id }, select: { workspaceId: true } }),
  custom_role: id => prisma.customRole.findUnique({ where: { id }, select: { workspaceId: true } }),
  user: id => prisma.user.findUnique({ where: { id }, select: { workspaceId: true } }),
  document_file: id => prisma.documentFile.findUnique({ where: { id }, select: { workspaceId: true } }),
  document_folder: id => prisma.documentFolder.findUnique({ where: { id }, select: { workspaceId: true } }),
  document_html_template: id =>
    prisma.documentHtmlTemplate.findUnique({ where: { id }, select: { workspaceId: true } }),
  workspace: async id => ({ workspaceId: id }),

  // Integração de workspace: a rota é /workspaces/:id/integrations/:provider
  integration: async id => ({ workspaceId: id })
}

async function resolveTenant(entityType, entityId) {
  if (!entityId || !TENANT_LOOKUP[entityType]) return null

  try {
    return (await TENANT_LOOKUP[entityType](entityId))?.workspaceId ?? null
  } catch {
    return null
  }
}

/**
 * tenantId é FK para Workspace: um id que não existe (workspace excluído, id inventado na URL ou no corpo) faria o
 * registro inteiro ser recusado pelo banco, justamente nas recusas do tipo "workspace não encontrado".
 */
async function existingWorkspaceId(...candidates) {
  for (const id of candidates) {
    if (typeof id !== 'string' || !id) continue

    try {
      if (await prisma.workspace.findUnique({ where: { id }, select: { id: true } })) return id
    } catch {
      // id em formato inválido: tenta o próximo
    }
  }

  return null
}

/** Só workspace e nome do corpo JSON (nunca o resto: pode ter senha ou conteúdo); multipart não é lido */
async function readBodyHints(req) {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return {}
  if (!req.headers.get('content-type')?.includes('application/json')) return {}

  try {
    const body = await req.clone().json()

    if (!body || typeof body !== 'object') return {}
    const name = body.title ?? body.name ?? null

    return {
      workspaceId: typeof body.workspaceId === 'string' ? body.workspaceId : null,
      name: typeof name === 'string' ? name.slice(0, 200) : null
    }
  } catch {
    return {}
  }
}

// Mensagens de erro podem citar e-mails (SMTP, conflito); a auditoria não guarda e-mails
const clean = text =>
  String(text)
    .replace(/[^\s@<>]+@[^\s@<>]+/g, '***')
    .slice(0, 300)

async function readMessage(response) {
  try {
    const data = await response.clone().json()

    return typeof data?.message === 'string' ? clean(data.message) : null
  } catch {
    return null
  }
}

export function withActionAudit(action, handler) {
  return async (req, context) => {
    const ctx = {}

    return store.run(ctx, async () => {
      // O corpo é lido antes do handler (clone): depois dele o stream já foi consumido
      const hints = await readBodyHints(req)
      let response
      let thrown = null

      try {
        response = await handler(req, context)
      } catch (error) {
        thrown = error
      }

      const status = thrown ? 500 : (response?.status ?? 500)

      if (status < 400 || status === 401) return response

      const requestId = getRequestId(req)

      try {
        const params = (await context?.params) ?? {}
        const actionName = typeof action === 'function' ? action(params) : action
        const entityType = ctx.entityType ?? entityTypeOf(actionName)
        const entityId = ctx.entityId ?? (params.id ? String(params.id).slice(0, 100) : null)
        const session = await getServerSession(authOptions).catch(() => null)
        const failed = status >= 500

        const error = thrown ? clean(thrown.message ?? thrown) : ctx.error ? clean(ctx.error) : null
        const message = thrown ? null : await readMessage(response)

        await createAuditLog({
          userId: session?.user?.id ?? null,
          tenantId: await existingWorkspaceId(
            ctx.tenantId,
            await resolveTenant(entityType, entityId),
            hints.workspaceId,
            new URL(req.url).searchParams.get('workspaceId')
          ),
          action: `${actionName}_${failed ? 'FAILED' : 'REJECTED'}`,
          entityType,
          entityId,
          after: { status, message, ...(error ? { error } : {}) },
          metadata: { requestId, name: ctx.name ?? hints.name ?? null, method: req.method },
          requestId
        })
      } catch (auditError) {
        // O registro nunca muda a resposta que a pessoa recebe
        logger.error('action-audit-failed', { requestId, error: auditError.message })
      }

      if (!thrown) return response

      logger.error('action-unhandled-error', { requestId, error: thrown.message })

      return jsonWithRequestId({ message: 'Erro interno ao processar a solicitação' }, { status: 500, requestId })
    })
  }
}
