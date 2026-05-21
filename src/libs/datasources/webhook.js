/**
 * Dados dinâmicos via webhook n8n.
 * Lista: [{ label, value }] ou { options: [...] }
 * CPF lookup: GET url?cpf=... → { found, name, cpf, ... }
 */
function normalizeOptions(data) {
  if (Array.isArray(data) && data.length === 1 && Array.isArray(data[0]?.options)) {
    return normalizeOptions(data[0].options)
  }

  if (Array.isArray(data)) {
    return data
      .map(row => ({
        label: String(row.label ?? row.name ?? '').trim(),
        value: String(row.value ?? row.id ?? '').trim()
      }))
      .filter(r => r.label && r.value)
  }

  if (Array.isArray(data?.options)) {
    return normalizeOptions(data.options)
  }

  if (Array.isArray(data?.rows)) {
    return normalizeOptions(data.rows)
  }

  return []
}

async function fetchWebhookJson(url, init = {}) {
  const headers = { ...init.headers }

  if (process.env.N8N_API_KEY) {
    headers.Authorization = `Bearer ${process.env.N8N_API_KEY}`
  }

  let res = await fetch(url, {
    ...init,
    headers
  })

  if (!res.ok && init.method === 'GET') {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: JSON.stringify({ action: 'datasource' })
    })
  }

  if (!res.ok) {
    throw new Error(`Webhook retornou ${res.status}`)
  }

  return res.json()
}

/** Lista dinâmica — chama webhook e retorna [{ label, value }] */
export async function getRows(_accessToken, config) {
  const baseUrl = config.url || config.webhookUrl
  if (!baseUrl) throw new Error('URL do webhook é obrigatória')

  const url = new URL(baseUrl)

  // Só repassa o param de dependência, se existir
  if (config.dependsOnParam && config.dependsOnValue !== undefined) {
    url.searchParams.set(config.dependsOnParam, String(config.dependsOnValue))
  }

  const data = await fetchWebhookJson(url.toString(), { method: 'GET' })
  return normalizeOptions(data)
}

/** Busca por CPF via GET ?cpf=valor */
export async function lookup(_accessToken, config) {
  const baseUrl = config.url || config.webhookUrl
  const searchValue = config.searchValue || config.cpf

  if (!baseUrl) throw new Error('URL do webhook é obrigatória')
  if (!searchValue) throw new Error('CPF é obrigatório')

  const url = new URL(baseUrl)
  url.searchParams.set('cpf', String(searchValue).trim())

  const data = await fetchWebhookJson(url.toString(), { method: 'GET' })

  return {
    found: Boolean(data?.found),
    name: data?.name ?? null,
    cpf: data?.cpf ?? searchValue,
    ...data
  }
}
