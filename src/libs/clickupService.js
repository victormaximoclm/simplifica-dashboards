const CLICKUP_API = 'https://api.clickup.com/api/v2'

/**
 * Troca o code OAuth pelo access_token
 * Chamado no callback após o redirect do ClickUp
 */
export async function exchangeCodeForToken(code, clientId, clientSecret) {
  const res = await fetch(`${CLICKUP_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code
    })
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.err || 'Erro ao trocar code por token')
  }

  return data.access_token
}

/**
 * Busca os dados do usuário autenticado no ClickUp
 * Retorna { accountId, accountEmail }
 */
export async function getClickUpUser(accessToken) {
  const res = await fetch(`${CLICKUP_API}/user`, {
    headers: { Authorization: accessToken }
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.err || 'Erro ao buscar usuário no ClickUp')
  }

  return {
    accountId: String(data.user.id),
    accountEmail: data.user.email
  }
}

/**
 * Verifica se o usuário pertence à lista de colaboradores do workspace
 * Retorna o membro encontrado ou lança erro se não encontrar
 */
export async function getUserFromList(accessToken, listId, accountId) {
  const res = await fetch(`${CLICKUP_API}/list/${listId}/member`, {
    headers: { Authorization: accessToken }
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.err || 'Erro ao buscar membros da lista')
  }

  const member = data.members?.find(m => String(m.id) === String(accountId))

  if (!member) {
    throw new Error('Usuário não encontrado na lista de colaboradores deste workspace')
  }

  return member
}

/**
 * Extrai o valor do campo personalizado de cargo do colaborador na lista
 * Busca as tasks da lista filtrando pelo assignee (accountId)
 * Retorna o valor do campo personalizado com id === cargoId ou null
 */
export async function extractCargo(accessToken, listId, userEmail, cargoId) {
  const MAX_PAGES = 50
  const pageSize = 100
  const emailNorm = userEmail.trim().toLowerCase()

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${CLICKUP_API}/list/${listId}/task`)
    url.searchParams.append('page', String(page))
    url.searchParams.append('include_closed', 'false')
    url.searchParams.append('subtasks', 'false')
    url.searchParams.append('limit', String(pageSize))
    url.searchParams.append('statuses[]', 'ativo')

    const res = await fetch(url.toString(), {
      headers: { Authorization: accessToken }
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.err || 'Erro ao buscar tasks da lista')

    const tasks = Array.isArray(data?.tasks) ? data.tasks : []

    for (const task of tasks) {
      const fields = Array.isArray(task.custom_fields) ? task.custom_fields : []

      // Encontra o campo e-mail
      const emailField = fields.find(f => f.name?.trim().toLowerCase() === 'e-mail')
      const emailValue = typeof emailField?.value === 'string' ? emailField.value.trim().toLowerCase() : null

      if (emailValue !== emailNorm) continue

      // Encontra o campo cargo pelo ID
      const cargoField = fields.find(f => f.id === cargoId)
      if (!cargoField) return null

      const raw = cargoField.value
      if (raw === null || raw === undefined) return null

      // Traduz o índice do dropdown para o label
      if (cargoField.type === 'drop_down' && Array.isArray(cargoField.type_config?.options)) {
        const option = cargoField.type_config.options.find(o => Number(o.orderindex) === Number(raw))
        return option?.name ?? null
      }

      return typeof raw === 'string' ? raw.trim() : String(raw)
    }

    if (tasks.length === 0 || tasks.length < pageSize) break
  }

  return null
}
