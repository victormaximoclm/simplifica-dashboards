// Regras de preenchimento compartilhadas entre o FormFillView (cliente) e o submit (servidor)

export function isFieldEmpty(val, field, values = {}) {
  if (field.type === 'multi-select-dynamic' || field.type === 'multi-input') {
    return !Array.isArray(val) || val.length === 0
  }
  if (field.type === 'checkbox') return !val
  if (field.type === 'cpf-lookup' && field.returnNameFieldId && field.required) {
    const nameVal = values[field.returnNameFieldId]
    return val === undefined || val === '' || val === null || !nameVal
  }
  return val === undefined || val === '' || val === null
}

export function validateFieldRegex(field, val) {
  const regex = field.validation?.regex?.trim()
  if (!regex || val === undefined || val === '' || val === null || typeof val === 'object') return null
  try {
    return new RegExp(regex).test(String(val)) ? null : field.validation?.message || 'Valor inválido'
  } catch {
    return null // regex inválido no builder não quebra o fill
  }
}

export function isFieldVisible(field, values) {
  // Novo: visibility com N regras
  const v = field.visibility
  if (v?.rules?.length > 0) {
    const results = v.rules.map(rule => {
      const raw = values[rule.fieldId]

      if (Array.isArray(raw)) {
        // multi-select: compara item a item (string ou { value, label, ... }), nunca concatena em string
        const items = raw.map(item => String(item?.value ?? item ?? ''))
        const target = String(rule.value)

        if (rule.op === 'eq') return items.some(item => item === target)
        if (rule.op === 'neq') return !items.some(item => item === target)
        if (rule.op === 'contains') return items.some(item => item.includes(target))
        return true
      }

      const val = String(raw ?? '')
      if (rule.op === 'eq') return val === String(rule.value)
      if (rule.op === 'neq') return val !== String(rule.value)
      if (rule.op === 'contains') return val.includes(rule.value)
      return true
    })
    const satisfied = v.operator === 'AND' ? results.every(Boolean) : results.some(Boolean)
    return v.action === 'show' ? satisfied : !satisfied
  }

  // Legado: condition simples
  if (field.condition?.fieldId) {
    const actual = String(values[field.condition.fieldId] ?? '')
    return actual === String(field.condition.value ?? '')
  }

  return true
}

export function isFieldRequired(field, values) {
  // Se tem requiredCondition, ela sobrescreve o required base
  if (field.requiredCondition?.fieldId) {
    const { fieldId, value } = field.requiredCondition
    const actual = values[fieldId]
    const actualStr = actual === undefined || actual === null ? '' : String(actual)
    return actualStr === String(value)
  }
  // Sem condição, usa o required estático
  return !!field.required
}

/** Campo com webhook de dados configurado (a URL em si só existe no servidor) */
export function hasDataSource(field) {
  const ds = field.dataSource
  return Boolean(ds?.hasSource || ds?.url || ds?.webhookUrl)
}

/** Chave usada no payload enviado ao n8n */
export const fieldKeyOf = field => field.fieldKey?.trim() || field.id
