export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/libs/auth'
import { getRequestId, logger } from '@/libs/logger'
import { executeDatasource, resolveAccessToken } from '@/libs/formDatasource'

// GET /api/forms/datasource?provider=&method=&workspaceId=&publicToken=
export async function GET(req) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  try {
    const { searchParams } = new URL(req.url)
    const provider = searchParams.get('provider')
    const method = searchParams.get('method')
    const workspaceId = searchParams.get('workspaceId')
    const publicToken = searchParams.get('publicToken')
    const formId = searchParams.get('formId')
    const fieldId = searchParams.get('fieldId')

    if (!provider || !method) {
      const response = NextResponse.json({ message: 'Provider e method são obrigatórios' }, { status: 400 })
      response.headers.set('x-request-id', requestId)
      return response
    }

    if (!session && !publicToken) {
      const response = NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
      response.headers.set('x-request-id', requestId)
      return response
    }

    const config = {}
    for (const [key, value] of searchParams.entries()) {
      if (!['provider', 'method', 'workspaceId', 'publicToken', 'formId', 'fieldId'].includes(key)) {
        config[key] = value
      }
    }

    if (formId) config.formId = formId
    if (fieldId) config.fieldId = fieldId
    if (workspaceId) config.workspaceId = workspaceId

    const accessToken = await resolveAccessToken({
      session,
      provider,
      publicToken,
      workspaceId
    })

    const result = await executeDatasource({ provider, method, config, accessToken })

    const response = NextResponse.json(result)
    response.headers.set('x-request-id', requestId)
    return response
  } catch (error) {
    const status = error.message?.includes('não configurada') ? 404 : 500
    logger.error('datasource-error', { requestId, error: error.message })
    const response = NextResponse.json({ message: error.message || 'Erro ao buscar dados' }, { status })
    response.headers.set('x-request-id', requestId)
    return response
  }
}
