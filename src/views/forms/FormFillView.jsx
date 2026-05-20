'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'

import FormTextField from './FormTextField'

import {
  btnPrimary,
  btnPrimarySm,
  btnSecondary,
  formCardCls,
  formAlertErrorCls,
  formCheckboxLabelCls,
  formDropdownAddCls,
  formDropdownCls,
  formDropdownItemCls,
  formErrorCls,
  formFieldsWrapCls,
  formHeadingCls,
  formInputCls,
  formInputReadonlyCls,
  formLabelCls,
  formMutedCls,
  formPageCls,
  formRequiredCls,
  formSubtitleCls,
  formSuccessIconCls,
  formWarningTextCls,
  formIconMutedCls,
  formChipRemoveBtnCls
} from './formStyles'

const WEBHOOK_FIELD_TYPES = new Set(['dynamic-list', 'multi-select-dynamic', 'cpf-lookup'])

const DATASOURCE_METHODS = {
  webhook: {
    'dynamic-list': 'getRows',
    'multi-select-dynamic': 'getRows',
    'cpf-lookup': 'lookup'
  }
}

function isFieldEmpty(val, field, values = {}) {
  if (field.type === 'multi-select-dynamic') {
    return !Array.isArray(val) || val.length === 0
  }
  if (field.type === 'checkbox') return !val
  if (field.type === 'cpf-lookup' && field.returnNameFieldId && field.required) {
    const nameVal = values[field.returnNameFieldId]
    return val === undefined || val === '' || val === null || !nameVal
  }
  return val === undefined || val === '' || val === null
}

function validateFieldRegex(field, val) {
  const regex = field.validation?.regex?.trim()
  if (!regex || val === undefined || val === '' || val === null) return null
  try {
    return new RegExp(regex).test(String(val)) ? null : field.validation?.message || 'Valor inválido'
  } catch {
    return null // regex inválido no builder não quebra o fill
  }
}

function isFieldVisible(field, values) {
  if (!field.condition) return true
  const { fieldId, value } = field.condition
  const actual = values[fieldId]
  // checkbox guarda boolean, compara como string
  const actualStr = actual === undefined || actual === null ? '' : String(actual)
  return actualStr === String(value)
}

function isFieldRequired(field, values) {
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

const FormFillView = ({ form, publicToken = null, canManage = false, lang }) => {
  const [values, setValues] = useState(() => {
    const initial = {}
    const fs = Array.isArray(form.fields) ? form.fields : []
    fs.forEach(f => {
      if (f.type === 'checkbox') initial[f.id] = false
    })
    return initial
  })
  const [options, setOptions] = useState({})
  const [cpfErrors, setCpfErrors] = useState({})
  const [loadingOptions, setLoadingOptions] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [linkClosedMessage, setLinkClosedMessage] = useState(null)
  const [error, setError] = useState(null)
  const router = useRouter()
  const handleGoLinks = () => router.push(`/${lang}/forms/${form.id}/links`)

  const fields = Array.isArray(form.fields) ? form.fields : []

  const hiddenFieldIds = useMemo(() => {
    const ids = new Set()
    fields.forEach(f => {
      if (f.type === 'cpf-lookup' && f.returnNameFieldId) ids.add(f.returnNameFieldId)
    })
    return ids
  }, [fields])

  const visibleFields = useMemo(
    () => fields.filter(f => (f.type === 'cpf-lookup' || !hiddenFieldIds.has(f.id)) && isFieldVisible(f, values)),
    [fields, hiddenFieldIds, values]
  )

  const fetchDatasource = useCallback(
    async (field, extra = {}) => {
      const ds = field.dataSource
      if (!WEBHOOK_FIELD_TYPES.has(field.type) && !ds?.provider) return null

      const provider = WEBHOOK_FIELD_TYPES.has(field.type) ? 'webhook' : ds.provider
      const method = DATASOURCE_METHODS[provider]?.[field.type]
      if (!method) return null

      const params = new URLSearchParams({
        provider,
        method,
        workspaceId: form.workspaceId,
        formId: form.id,
        fieldId: field.id
      })

      if (publicToken) params.set('publicToken', publicToken)

      const configKeys = {
        webhook: ['url', 'webhookUrl']
      }

      for (const key of configKeys[provider] ?? []) {
        const val = ds?.[key] ?? extra[key]
        if (val !== undefined && val !== null && val !== '') {
          params.set(key, Array.isArray(val) ? val.join(',') : String(val))
        }
      }

      if (extra.searchValue) params.set('searchValue', extra.searchValue)

      const res = await fetch(`/api/forms/datasource?${params}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Erro ao carregar dados')
      }

      return res.json()
    },
    [form.id, form.workspaceId, publicToken]
  )

  useEffect(() => {
    fields.forEach(async field => {
      if (field.type !== 'dynamic-list' && field.type !== 'multi-select-dynamic') return
      const listUrl = field.dataSource?.url || field.dataSource?.webhookUrl
      if (!listUrl) return

      setLoadingOptions(prev => ({ ...prev, [field.id]: true }))
      try {
        const data = await fetchDatasource(field)
        setOptions(prev => ({ ...prev, [field.id]: Array.isArray(data) ? data : [] }))
      } catch {
        setOptions(prev => ({ ...prev, [field.id]: [] }))
      } finally {
        setLoadingOptions(prev => ({ ...prev, [field.id]: false }))
      }
    })
  }, [fields, fetchDatasource])

  const setValue = (fieldId, value) => setValues(prev => ({ ...prev, [fieldId]: value }))

  const handleCpfLookup = async field => {
    const cpf = values[field.id]
    const listUrl = field.dataSource?.url || field.dataSource?.webhookUrl
    if (!cpf || !listUrl) return

    setLoadingOptions(prev => ({ ...prev, [field.id]: true }))
    setCpfErrors(prev => ({ ...prev, [field.id]: null }))

    try {
      const result = await fetchDatasource(field, { searchValue: cpf })

      if (result?.found) {
        setValues(prev => ({
          ...prev,
          [field.id]: result.cpf ?? cpf,
          ...(field.returnNameFieldId ? { [field.returnNameFieldId]: result.name ?? '' } : {})
        }))
      } else {
        setCpfErrors(prev => ({ ...prev, [field.id]: 'CPF não encontrado' }))
        setValues(prev => ({
          ...prev,
          [field.id]: cpf,
          ...(field.returnNameFieldId ? { [field.returnNameFieldId]: '' } : {})
        }))
      }
    } catch (err) {
      setCpfErrors(prev => ({ ...prev, [field.id]: err.message }))
    } finally {
      setLoadingOptions(prev => ({ ...prev, [field.id]: false }))
    }
  }

  const handleCpfChange = (field, cpf) => {
    setValue(field.id, cpf)
    if (field.returnNameFieldId) setValue(field.returnNameFieldId, '')
    setCpfErrors(prev => ({ ...prev, [field.id]: null }))
  }

  const handleSubmit = async e => {
    e.preventDefault()
    setError(null)

    for (const field of fields) {
      if (!isFieldVisible(field, values)) continue

      if (isFieldRequired(field, values) && isFieldEmpty(values[field.id], field, values)) {
        setError(`O campo "${field.label}" é obrigatório.`)
        return
      }
    }

    for (const field of fields) {
      if (field.type === 'multi-select-dynamic' && field.extraFields?.length > 0) {
        const items = values[field.id] ?? []
        for (const item of items) {
          for (const ef of field.extraFields) {
            if (ef.required && (item[ef.key] === '' || item[ef.key] === undefined || item[ef.key] === null)) {
              setError(`Preencha "${ef.label}" para todos os itens em "${field.label}".`)
              return
            }
          }
        }
      }
    }

    for (const field of fields) {
      if (!isFieldVisible(field, values)) continue
      const regexError = validateFieldRegex(field, values[field.id])
      if (regexError) {
        setError(`"${field.label}": ${regexError}`)
        return
      }
    }

    setSubmitting(true)

    try {
      // Remapeia id → fieldKey no payload
      const remappedFields = Object.fromEntries(
        fields.map(f => {
          const key = f.fieldKey?.trim() || f.id
          return [key, values[f.id]]
        })
      )

      const payload = { fields: remappedFields }
      if (publicToken) payload.publicToken = publicToken

      const res = await fetch(`/api/forms/${form.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Erro ao enviar')
      }

      setSubmitted(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleReset = () => {
    if (publicToken) return
    const initial = {}
    fields.forEach(f => {
      if (f.type === 'checkbox') initial[f.id] = false
    })
    setValues(initial)
    setCpfErrors({})
    setError(null)
    setSubmitted(false)
  }

  if (linkClosedMessage) {
    return (
      <div
        className={`${formPageCls} flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center max-w-2xl mx-auto`}
      >
        <i className='tabler-link-off text-5xl text-[var(--mui-palette-warning-main)]' />
        <h4 className={`text-xl font-semibold ${formHeadingCls}`}>Link indisponível</h4>
        <p className={formMutedCls}>{linkClosedMessage}</p>
      </div>
    )
  }

  if (submitted) {
    return (
      <div
        className={`${formPageCls} flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center max-w-2xl mx-auto`}
      >
        <i className={`tabler-circle-check text-5xl ${formSuccessIconCls}`} />
        <h4 className={`text-xl font-semibold ${formHeadingCls}`}>Enviado com sucesso</h4>
        <p className={formMutedCls}>
          {publicToken
            ? 'Suas respostas foram registradas. Este link é de uso único e não aceita novos envios.'
            : 'Suas respostas foram registradas.'}
        </p>
        {!publicToken && (
          <button type='button' onClick={handleReset} className={`${btnPrimary} ${formFieldsWrapCls}`}>
            Preencher novamente
          </button>
        )}
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`${formPageCls} max-w-2xl mx-auto w-full flex flex-col gap-6 ${formCardCls} rounded-2xl`}
    >
      <header className={formFieldsWrapCls}>
        <div className='flex items-start justify-between gap-3'>
          <div className='flex-1 min-w-0'>
            <h1 className={formHeadingCls}>{form.title}</h1>
            {form.description && <p className={`${formSubtitleCls} mt-1`}>{form.description}</p>}
            {publicToken && form.expiresAt && (
              <p className={`text-xs ${formWarningTextCls} mt-2`}>
                Link válido até {new Date(form.expiresAt).toLocaleString('pt-BR')}
              </p>
            )}
          </div>
          {canManage && form.allowPublicLink && (
            <button type='button' onClick={handleGoLinks} className={`${btnSecondary} shrink-0`}>
              <i className='tabler-link text-sm' />
              Link
            </button>
          )}
        </div>
      </header>

      {error && <div className={`${formAlertErrorCls} ${formFieldsWrapCls}`}>{error}</div>}

      {visibleFields.map(field => (
        <FieldInput
          key={field.id}
          field={field}
          value={values[field.id]}
          nameValue={field.returnNameFieldId ? values[field.returnNameFieldId] : undefined}
          options={options[field.id]}
          cpfError={cpfErrors[field.id]}
          loading={loadingOptions[field.id]}
          onChange={v => setValue(field.id, v)}
          onCpfChange={cpf => handleCpfChange(field, cpf)}
          onCpfLookup={() => handleCpfLookup(field)}
        />
      ))}

      <button type='submit' disabled={submitting} className={`${btnPrimary} ${formFieldsWrapCls}`}>
        {submitting ? <i className='tabler-loader-2 animate-spin' /> : <i className='tabler-send' />}
        {submitting ? 'Enviando...' : 'Enviar'}
      </button>
    </form>
  )
}

const FormFieldWrap = ({ children }) => <div className={formFieldsWrapCls}>{children}</div>

const FormLabel = ({ children, required }) => (
  <label className={formLabelCls}>
    {children}
    {required && <span className={formRequiredCls}>*</span>}
  </label>
)

const FieldInput = ({ field, value, nameValue, options, cpfError, loading, onChange, onCpfChange, onCpfLookup }) => {
  switch (field.type) {
    case 'textarea':
      return (
        <FormFieldWrap>
          <FormTextField
            fullWidth
            multiline
            rows={4}
            label={field.label}
            required={field.required}
            value={value ?? ''}
            onChange={e => onChange(e.target.value)}
            placeholder={field.placeholder}
          />
        </FormFieldWrap>
      )
    case 'number':
      return (
        <FormFieldWrap>
          <FormTextField
            fullWidth
            type='number'
            label={field.label}
            required={field.required}
            value={value ?? ''}
            onChange={e => onChange(e.target.value)}
            placeholder={field.placeholder}
          />
        </FormFieldWrap>
      )
    case 'date':
      return (
        <FormFieldWrap>
          <FormTextField
            fullWidth
            type='date'
            label={field.label}
            required={field.required}
            value={value ?? ''}
            onChange={e => onChange(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
        </FormFieldWrap>
      )
    case 'select':
      return (
        <FormFieldWrap>
          <FormLabel required={field.required}>{field.label}</FormLabel>
          <select value={value ?? ''} onChange={e => onChange(e.target.value)} className={formInputCls}>
            <option value=''>Selecione...</option>
            {(field.options ?? []).map(opt => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </FormFieldWrap>
      )
    case 'checkbox':
      return (
        <FormFieldWrap>
          <label className='flex items-center gap-2 !cursor-pointer'>
            <input
              type='checkbox'
              checked={!!value}
              onChange={e => onChange(e.target.checked)}
              className='accent-[var(--mui-palette-primary-main)]'
            />
            <span className={formCheckboxLabelCls}>
              {field.label}
              {field.required && <span className={formRequiredCls}>*</span>}
            </span>
          </label>
        </FormFieldWrap>
      )
    case 'file':
      return (
        <FormFieldWrap>
          <FormLabel required={field.required}>{field.label}</FormLabel>
          <input
            type='file'
            accept={field.accept}
            onChange={e => {
              const file = e.target.files?.[0]
              if (!file) return onChange(null)
              const reader = new FileReader()
              reader.onload = () => onChange({ name: file.name, type: file.type, size: file.size, data: reader.result })
              reader.readAsDataURL(file)
            }}
            className={formInputCls}
          />
        </FormFieldWrap>
      )
    case 'dynamic-list':
      return (
        <FormFieldWrap>
          <FormLabel required={field.required}>{field.label}</FormLabel>
          <select
            value={value ?? ''}
            onChange={e => onChange(e.target.value)}
            disabled={loading}
            className={formInputCls}
          >
            <option value=''>{loading ? 'Carregando...' : 'Selecione...'}</option>
            {(options ?? []).map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </FormFieldWrap>
      )
    case 'multi-select-dynamic':
      return (
        <MultiSelectDynamicInput field={field} value={value} options={options} loading={loading} onChange={onChange} />
      )
    case 'cpf-lookup':
      return (
        <CpfLookupInput
          field={field}
          cpfValue={value}
          nameValue={nameValue}
          cpfError={cpfError}
          loading={loading}
          onCpfChange={onCpfChange}
          onCpfLookup={onCpfLookup}
        />
      )
    case 'time':
      return (
        <FormFieldWrap>
          <FormTextField
            fullWidth
            type='time'
            label={field.label}
            required={field.required}
            value={value ?? ''}
            onChange={e => onChange(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
        </FormFieldWrap>
      )
    default:
      return (
        <FormFieldWrap>
          <FormTextField
            fullWidth
            label={field.label}
            required={field.required}
            value={value ?? ''}
            onChange={e => onChange(e.target.value)}
            placeholder={field.placeholder}
          />
        </FormFieldWrap>
      )
  }
}

const CpfLookupInput = ({ field, cpfValue, nameValue, cpfError, loading, onCpfChange, onCpfLookup }) => (
  <FormFieldWrap>
    <div className='flex flex-col gap-3'>
      <div>
        <FormLabel required={field.required}>{field.label}</FormLabel>
        <div className='flex flex-col sm:flex-row gap-2'>
          <input
            type='text'
            value={cpfValue ?? ''}
            onChange={e => onCpfChange(e.target.value)}
            placeholder='000.000.000-00'
            className={`${formInputCls} flex-1 min-w-0`}
          />
          <button type='button' onClick={onCpfLookup} disabled={loading} className={`${btnPrimarySm} w-full sm:w-auto`}>
            {loading ? '...' : 'Buscar'}
          </button>
        </div>
        {cpfError && <p className={formErrorCls}>{cpfError}</p>}
      </div>

      {field.returnNameFieldId && (
        <div>
          <FormLabel>Nome</FormLabel>
          <input
            type='text'
            value={nameValue ?? ''}
            readOnly
            placeholder='Busque o CPF para preencher'
            className={formInputReadonlyCls}
          />
        </div>
      )}
    </div>
  </FormFieldWrap>
)

const MultiSelectDynamicInput = ({ field, value, options, loading, onChange }) => {
  const extraFields = field.extraFields ?? []
  const hasExtras = extraFields.length > 0

  // value agora é array de objetos
  const selected = Array.isArray(value) ? value : []

  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  const opts = options ?? []

  useEffect(() => {
    const handleClickOutside = e => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const q = search.trim().toLowerCase()
  const selectedValues = selected.map(s => s.value)

  const filtered = (
    q
      ? opts.filter(
          o =>
            String(o.label ?? '')
              .toLowerCase()
              .includes(q) ||
            String(o.value ?? '')
              .toLowerCase()
              .includes(q)
        )
      : opts
  ).filter(o => !selectedValues.includes(o.value)) // remove já selecionados

  const exactMatch =
    q.length > 0 &&
    opts.some(o => String(o.label ?? '').toLowerCase() === q || String(o.value ?? '').toLowerCase() === q)
  const showCustomAdd = q.length > 0 && !exactMatch

  const addItem = (val, label) => {
    const initExtras = Object.fromEntries(extraFields.map(ef => [ef.key, ef.type === 'checkbox' ? false : '']))
    onChange([...selected, { value: val, label: label ?? val, ...initExtras }])
    setSearch('')
    setOpen(false)
  }

  const removeAt = index => onChange(selected.filter((_, i) => i !== index))

  const updateExtra = (index, key, val) => {
    const next = selected.map((item, i) => (i === index ? { ...item, [key]: val } : item))
    onChange(next)
  }

  return (
    <FormFieldWrap>
      <div ref={containerRef}>
        <FormLabel required={field.required}>{field.label}</FormLabel>

        {/* Search input */}
        <div className='relative'>
          <i
            className={`tabler-search absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none ${formIconMutedCls}`}
          />
          <input
            type='text'
            value={search}
            onChange={e => {
              setSearch(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            placeholder={loading ? 'Carregando opções...' : 'Buscar ou adicionar...'}
            disabled={loading}
            className={`${formInputCls} pl-9`}
          />

          {open && !loading && (
            <ul className={formDropdownCls} style={{ backgroundColor: 'var(--mui-palette-background-default)' }}>
              {filtered.length === 0 && !showCustomAdd && (
                <li className={`px-3 py-2 text-sm ${formMutedCls}`}>Nenhuma opção encontrada</li>
              )}
              {filtered.map(opt => (
                <li key={opt.value}>
                  <button type='button' className={formDropdownItemCls} onClick={() => addItem(opt.value, opt.label)}>
                    {opt.label}
                  </button>
                </li>
              ))}
              {showCustomAdd && (
                <li>
                  <button type='button' className={formDropdownAddCls} onClick={() => addItem(search.trim())}>
                    <i className='tabler-plus text-base' />
                    Adicionar &apos;{search.trim()}&apos;
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>

        {/* Itens selecionados */}
        {selected.length > 0 && (
          <div className='flex flex-col gap-3 mt-3'>
            {selected.map((item, index) => (
              <div
                key={`${item.value}-${index}`}
                className='flex flex-col gap-3 p-3 rounded-lg border border-[var(--mui-palette-divider)] bg-[var(--mui-palette-background-paper)]'
              >
                {/* Header do item */}
                <div className='flex items-center justify-between'>
                  <span className={`text-sm font-medium ${formHeadingCls}`}>{item.label ?? item.value}</span>
                  <button
                    type='button'
                    onClick={() => removeAt(index)}
                    className={formChipRemoveBtnCls}
                    aria-label='Remover'
                  >
                    <i className='tabler-x text-sm' />
                  </button>
                </div>

                {/* Campos extras */}
                {hasExtras && (
                  <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                    {extraFields.map(ef => (
                      <div key={ef.id} className='flex flex-col gap-1'>
                        <label className={formLabelCls}>
                          {ef.label}
                          {ef.required && <span className={formRequiredCls}>*</span>}
                        </label>

                        {ef.type === 'text' && (
                          <input
                            type='text'
                            value={item[ef.key] ?? ''}
                            onChange={e => updateExtra(index, ef.key, e.target.value)}
                            className={formInputCls}
                          />
                        )}
                        {ef.type === 'number' && (
                          <input
                            type='number'
                            value={item[ef.key] ?? ''}
                            onChange={e => updateExtra(index, ef.key, e.target.value)}
                            className={formInputCls}
                          />
                        )}
                        {ef.type === 'select' && (
                          <select
                            value={item[ef.key] ?? ''}
                            onChange={e => updateExtra(index, ef.key, e.target.value)}
                            className={formInputCls}
                          >
                            <option value=''>Selecione...</option>
                            {(ef.options ?? []).map(o => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                        )}
                        {ef.type === 'checkbox' && (
                          <label className='flex items-center gap-2 cursor-pointer mt-1'>
                            <input
                              type='checkbox'
                              checked={!!item[ef.key]}
                              onChange={e => updateExtra(index, ef.key, e.target.checked)}
                              className='accent-[var(--mui-palette-primary-main)]'
                            />
                            <span className={formMutedCls}>{ef.label}</span>
                          </label>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </FormFieldWrap>
  )
}

export default FormFillView
