export const CLICKUP_WORKSPACE_CONFIG_DEFAULTS = {
  // workspace
  workspaceId: '',
  listId: '',
  cargoId: '', // ID do campo personalizado "cargo" na lista
  token: '',
  clientId: '',
  clientSecret: ''
}

export const CLICKUP_USER_CONFIG_DEFAULTS = {
  // user
  cargo: ''
}

/** Exibir seção de vincular ClickUp na página de perfil do usuário */
export const SHOW_CLICKUP_IN_USER_PROFILE = false

/** Integração ClickUp do workspace pronta para OAuth de usuários */
export function isClickUpWorkspaceConfigured(integration) {
  if (!integration?.enabled) return false

  const cfg = integration.configJson

  return Boolean(cfg?.clientId && cfg?.clientSecret && cfg?.listId)
}

/** Remove credenciais sensíveis do configJson antes de expor na API */
export function sanitizeWorkspaceIntegration(integration) {
  if (!integration) return null

  const configJson = integration.configJson

  if (!configJson || typeof configJson !== 'object') {
    return integration
  }

  const { clientSecret, token, ...safeConfig } = configJson

  return { ...integration, configJson: safeConfig }
}
