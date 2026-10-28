export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/libs/auth'
import { getRequestId, logger } from '@/libs/logger'
import { prisma } from '@/libs/prisma'
import { executeDatasource } from '@/libs/formDatasource'
import { getUserFormContext } from '@/libs/formAccess'
import { canSubmitForm } from '@/libs/formPermissions'
import { isPublicLinkActive } from '@/libs/formlinkservice'
import { createRateLimit } from '@/libs/rateLimit'

const datasourceLimiter = createRateLimit({ interval: 60_000, limit: 120 })

// Tipo de campo → método do datasource webhook
const FIELD_METHODS = {
  'dynamic-list': 'getRows',
  'multi-select-dynamic': 'getRows',
  'cpf-lookup': 'lookup'
}

const json = (requestId, body, status = 200) => {
  const response = NextResponse.json(body, { status })
  response.headers.set('x-request-id', requestId)
  return response
}

/** Mesmo acesso de quem pode preencher: link público ativo do form ou sessão com permissão de envio */
async function canUseFormDatasource({ form, session, publicToken }) {
  if (publicToken) {
    const link = await prisma.formPublicLink.findUnique({ where: { token: publicToken } })
    return Boolean(link && link.formId === form.id && form.allowPublicLink && isPublicLinkActive(link))
  }

  if (!session?.user) return false

  const ctx = await getUserFormContext(session.user.id)
  return canSubmitForm(session, form, ctx)
}

// GET /api/forms/datasource?formId=&fieldId=&publicToken=&dependsOnValue=&searchValue=
// A URL do webhook vem sempre da config do campo salva no banco — nunca do cliente
export async function GET(req) {
  const requestId = getRequestId(req)

  try {
    const rate = await datasourceLimiter.check(req)
    if (!rate.success) {
      logger.warn('datasource-rate-limit', { requestId })
      return json(requestId, { message: 'Muitas requisições' }, 429)
    }

    const { searchParams } = new URL(req.url)
    const formId = searchParams.get('formId')
    const fieldId = searchParams.get('fieldId')
    const publicToken = searchParams.get('publicToken')

    if (!formId || !fieldId) {
      return json(requestId, { message: 'formId e fieldId são obrigatórios' }, 400)
    }

    const session = publicToken ? null : await getServerSession(authOptions)

    if (!session && !publicToken) {
      return json(requestId, { message: 'Não autorizado' }, 401)
    }

    const form = await prisma.form.findUnique({ where: { id: formId } })

    if (!form || !(await canUseFormDatasource({ form, session, publicToken }))) {
      logger.warn('datasource-forbidden', { requestId, formId, isPublic: Boolean(publicToken) })
      return json(requestId, { message: 'Acesso negado' }, 403)
    }

    const fields = Array.isArray(form.fields) ? form.fields : []
    const field = fields.find(f => f.id === fieldId)
    const method = FIELD_METHODS[field?.type]
    const url = field?.dataSource?.url || field?.dataSource?.webhookUrl

    if (!method || !url) {
      return json(requestId, { message: 'Campo sem fonte de dados' }, 404)
    }

    const config = { url }

    if (method === 'getRows' && field.dependsOn && searchParams.has('dependsOnValue')) {
      config.dependsOnParam = field.dependsOnParam || 'dependsOnValue'
      config.dependsOnValue = searchParams.get('dependsOnValue')
    }

    if (method === 'lookup') {
      config.searchValue = searchParams.get('searchValue')
    }

    const result = await executeDatasource({ provider: 'webhook', method, config, accessToken: null })

    return json(requestId, result)
  } catch (error) {
    logger.error('datasource-error', { requestId, error: error.message })
    return json(requestId, { message: error.message || 'Erro ao buscar dados' }, 500)
  }
}
