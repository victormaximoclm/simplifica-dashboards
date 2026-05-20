import { prisma } from '@/libs/prisma'
import { resolveDataSource } from '@/libs/datasources'
import { validateToken } from '@/libs/formlinkservice'

const WEBHOOK_PROVIDERS = new Set(['webhook', 'google-sheets', 'csv'])

/** Resolve token de acesso para chamadas de datasource */
export async function resolveAccessToken({ session, provider, publicToken, workspaceId }) {
  if (WEBHOOK_PROVIDERS.has(provider)) {
    return null
  }

  if (session?.user?.id) {
    const userIntegration = await prisma.userIntegration.findFirst({
      where: { userId: session.user.id, provider, enabled: true }
    })

    if (userIntegration?.token) return userIntegration.token
  }

  if (publicToken) {
    const link = await validateToken(publicToken)
    const wsId = link.form.workspaceId

    const wsIntegration = await prisma.workspaceIntegration.findFirst({
      where: { workspaceId: wsId, provider, enabled: true }
    })

    const token = wsIntegration?.configJson?.token
    if (token) return token

    throw new Error(`Integração '${provider}' não configurada no workspace`)
  }

  if (workspaceId) {
    const wsIntegration = await prisma.workspaceIntegration.findFirst({
      where: { workspaceId, provider, enabled: true }
    })
    if (wsIntegration?.configJson?.token) return wsIntegration.configJson.token
  }

  throw new Error(`Integração '${provider}' não configurada`)
}

export function normalizeDatasourceConfig(config) {
  const normalized = { ...config }

  if (normalized.url && !normalized.webhookUrl) {
    normalized.webhookUrl = normalized.url
  }
  if (normalized.webhookUrl && !normalized.url) {
    normalized.url = normalized.webhookUrl
  }

  if (normalized.cpfFieldId && !normalized.searchFieldId) {
    normalized.searchFieldId = normalized.cpfFieldId
  }

  // Migrar providers legados para webhook
  if (WEBHOOK_PROVIDERS.has(normalized.provider) && normalized.provider !== 'webhook') {
    if (!normalized.sourceType) {
      normalized.sourceType = normalized.provider === 'google-sheets' ? 'google-sheets' : 'csv'
    }
  }

  return normalized
}

export async function executeDatasource({ provider, method, config, accessToken }) {
  const dataSource = resolveDataSource(provider)

  if (!dataSource[method]) {
    throw new Error(`Método '${method}' não encontrado no provider '${provider}'`)
  }

  return dataSource[method](accessToken, normalizeDatasourceConfig(config))
}
