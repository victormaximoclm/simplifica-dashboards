const CLICKUP_API = 'https://api.clickup.com/api/v2'

/**
 * Carrega tasks de uma lista para popular campos dinâmicos
 * Retorna array de { label, value } para o frontend renderizar
 */
export async function getListTasks(accessToken, { listId, labelField = 'name', valueField = 'id' }) {
  const MAX_PAGES = 50
  const pageSize = 100
  const results = []

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${CLICKUP_API}/list/${listId}/task`)
    url.searchParams.append('page', String(page))
    url.searchParams.append('include_closed', 'false')
    url.searchParams.append('subtasks', 'false')
    url.searchParams.append('limit', String(pageSize))

    const res = await fetch(url.toString(), {
      headers: { Authorization: accessToken }
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.err || 'Erro ao buscar tasks')

    const tasks = Array.isArray(data?.tasks) ? data.tasks : []

    for (const task of tasks) {
      const label = labelField === 'name' ? task.name : getCustomFieldValue(task, labelField)
      const value = valueField === 'id' ? task.id : getCustomFieldValue(task, valueField)

      if (label && value) {
        results.push({ label, value })
      }
    }

    if (tasks.length === 0 || tasks.length < pageSize) break
  }

  return results
}

/**
 * Busca task pelo valor de um campo personalizado (ex: CPF)
 * Retorna os campos solicitados em returnFields
 */
export async function findTaskByField(accessToken, { listId, searchFieldId, searchValue, returnFields = [] }) {
  const MAX_PAGES = 50
  const pageSize = 100
  const searchNorm = String(searchValue).trim().toLowerCase()

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${CLICKUP_API}/list/${listId}/task`)
    url.searchParams.append('page', String(page))
    url.searchParams.append('include_closed', 'false')
    url.searchParams.append('subtasks', 'false')
    url.searchParams.append('limit', String(pageSize))

    const res = await fetch(url.toString(), {
      headers: { Authorization: accessToken }
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.err || 'Erro ao buscar tasks')

    const tasks = Array.isArray(data?.tasks) ? data.tasks : []

    for (const task of tasks) {
      const fields = Array.isArray(task.custom_fields) ? task.custom_fields : []
      const searchField = fields.find(f => f.id === searchFieldId)
      const fieldValue = extractFieldValue(searchField)

      if (
        String(fieldValue ?? '')
          .trim()
          .toLowerCase() !== searchNorm
      )
        continue

      // Monta resultado com os campos solicitados
      const result = { taskId: task.id, taskName: task.name }

      for (const fieldId of returnFields) {
        const field = fields.find(f => f.id === fieldId)
        result[fieldId] = extractFieldValue(field)
      }

      return result
    }

    if (tasks.length === 0 || tasks.length < pageSize) break
  }

  return null
}

// Extrai valor de um campo personalizado resolvendo dropdowns
function extractFieldValue(field) {
  if (!field) return null

  const raw = field.value
  if (raw === null || raw === undefined) return null

  if (field.type === 'drop_down' && Array.isArray(field.type_config?.options)) {
    const option = field.type_config.options.find(o => Number(o.orderindex) === Number(raw))
    return option?.name ?? null
  }

  if (typeof raw === 'string') return raw.trim()
  if (typeof raw === 'number') return String(raw)
  if (typeof raw === 'object') return raw.label ?? raw.name ?? raw.value ?? null

  return null
}

// Busca valor de campo pelo nome ou id dentro de uma task
function getCustomFieldValue(task, fieldIdentifier) {
  const fields = Array.isArray(task.custom_fields) ? task.custom_fields : []
  const field = fields.find(f => f.id === fieldIdentifier || f.name?.toLowerCase() === fieldIdentifier.toLowerCase())
  return extractFieldValue(field)
}
