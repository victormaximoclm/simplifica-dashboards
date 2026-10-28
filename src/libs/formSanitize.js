// Prepara o form para o navegador e valida o que volta dele — URLs de webhook nunca saem do servidor

import { fieldKeyOf, isFieldEmpty, isFieldRequired, isFieldVisible, validateFieldRegex } from '@/libs/formRules'

const MAX_PAYLOAD_CHARS = 500_000

/** Remove as URLs de webhook dos campos, mantendo só a indicação de que existe uma fonte */
export function stripFieldSecrets(fields) {
  if (!Array.isArray(fields)) return []

  return fields.map(field => {
    if (!field?.dataSource) return field
    const { url, webhookUrl, ...dataSource } = field.dataSource
    return { ...field, dataSource: { ...dataSource, hasSource: Boolean(url || webhookUrl) } }
  })
}

/** Form seguro para enviar ao cliente (preenchimento) */
export function toClientForm(form) {
  // eslint-disable-next-line no-unused-vars
  const { webhookUrl, ...rest } = form
  return { ...rest, fields: stripFieldSecrets(form.fields) }
}

const isEmptyValue = val => val === undefined || val === null || val === '' || val === false

/**
 * Valida o payload do submit contra a definição do form, com as mesmas regras do cliente.
 * Só passam chaves de campos existentes; campos ocultos não carregam dados.
 * @returns {{ fields: object } | { error: string }}
 */
export function validateSubmission(formFields, payload) {
  const fields = Array.isArray(formFields) ? formFields : []

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { error: 'Dados do formulário inválidos.' }
  }

  if (JSON.stringify(payload).length > MAX_PAYLOAD_CHARS) {
    return { error: 'Dados do formulário excedem o tamanho permitido.' }
  }

  const known = new Set(fields.map(fieldKeyOf))
  const unknown = Object.keys(payload).filter(key => !known.has(key))
  if (unknown.length > 0) {
    return { error: 'O envio contém campos que não pertencem ao formulário.' }
  }

  // Reconstrói os valores por id, como o FormFillView guarda antes de remapear
  const values = {}
  for (const field of fields) {
    const raw = payload[fieldKeyOf(field)]

    if (field.type === 'cpf-lookup') {
      if (raw !== undefined && raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) {
        return { error: `Valor inválido em "${field.label}".` }
      }
      values[field.id] = raw?.cpf
      if (raw?.value !== undefined) values[`${field.id}__value`] = raw.value
    } else {
      values[field.id] = raw
    }
  }

  for (const field of fields) {
    if (!isFieldVisible(field, values)) continue

    if (isFieldRequired(field, values) && isFieldEmpty(values[field.id], field, values)) {
      return { error: `O campo "${field.label}" é obrigatório.` }
    }

    const regexError = validateFieldRegex(field, values[field.id])
    if (regexError) return { error: `"${field.label}": ${regexError}` }
  }

  const clean = {}
  for (const field of fields) {
    const key = fieldKeyOf(field)
    if (!(key in payload)) continue

    if (!isFieldVisible(field, values)) {
      // O cliente limpa campos ocultos (checkbox vira false); não deixa passar dado escondido
      if (!isEmptyValue(payload[key])) {
        if (field.type === 'checkbox') clean[key] = false
        continue
      }
    }

    clean[key] = payload[key]
  }

  return { fields: clean }
}
