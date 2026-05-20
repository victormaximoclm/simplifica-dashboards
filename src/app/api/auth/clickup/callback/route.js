export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/libs/auth'
import { getRequestId, logger } from '@/libs/logger'
import { getWorkspaceIntegration } from '@/libs/workspaceIntegrations'
import { upsertUserIntegration } from '@/libs/userIntegrations'
import { exchangeCodeForToken, getClickUpUser, getUserFromList, extractCargo } from '@/libs/clickupService'
import { createAuditLog } from '@/libs/auditService'
import { createNotification } from '@/libs/notifications'
import { CLICKUP_USER_CONFIG_DEFAULTS, isClickUpWorkspaceConfigured } from '@/app/constants/integration'

export async function GET(req) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login?error=unauthorized`)
  }

  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/perfil?error=clickup_no_code`)
  }

  const workspaceId = session.user.workspaceId

  if (!workspaceId) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/perfil?error=clickup_no_workspace`)
  }

  try {
    // 1. Busca configuração do workspace
    const workspaceIntegration = await getWorkspaceIntegration(workspaceId, 'clickup')

    if (!isClickUpWorkspaceConfigured(workspaceIntegration)) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/perfil?error=clickup_not_configured`)
    }

    const { clientId, clientSecret, listId, cargoId } = workspaceIntegration.configJson

    // 2. Troca code por access_token
    const accessToken = await exchangeCodeForToken(code, clientId, clientSecret)

    // 3. Obtém dados do usuário no ClickUp
    const { accountId, accountEmail } = await getClickUpUser(accessToken)

    // 4. Verifica se pertence à lista de colaboradores do workspace
    await getUserFromList(accessToken, listId, accountId)

    // 5. Extrai cargo
    const cargo = await extractCargo(accessToken, listId, accountEmail, cargoId)

    // 6. Salva no banco
    await upsertUserIntegration(session.user.id, 'clickup', {
      token: accessToken,
      accountEmail,
      accountId,
      enabled: true,
      configJson: {
        ...CLICKUP_USER_CONFIG_DEFAULTS,
        cargo: cargo ?? ''
      }
    })

    // 7. Notificação e audit log
    await createNotification({
      type: 'integration_connected',
      title: 'ClickUp conectado',
      message: `${session.user.name || session.user.email} conectou sua conta ClickUp (${accountEmail})`,
      workspaceId,
      createdById: session.user.id
    })

    logger.info('clickup-integration-connected', {
      requestId,
      userId: session.user.id,
      workspaceId,
      accountEmail
    })

    await createAuditLog({
      userId: session.user.id,
      tenantId: workspaceId,
      action: 'CLICKUP_INTEGRATION_CONNECT',
      entityType: 'userIntegration',
      after: { accountEmail, cargo },
      metadata: { requestId }
    })

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/br/pages/account-settings?success=clickup_connected`
    )
  } catch (error) {
    logger.error('clickup-callback-error', { requestId, error: error.message })

    const errorKey = error.message.includes('não encontrado') ? 'clickup_not_in_workspace' : 'clickup_error'
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/br/pages/account-settings?error=${errorKey}`)
  }
}
