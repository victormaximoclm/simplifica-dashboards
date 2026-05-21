'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-toastify'

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

const FIELDS_PER_PAGE = 10

const WEBHOOK_FIELD_TYPES = new Set(['dynamic-list', 'multi-select-dynamic', 'cpf-lookup'])

const DATASOURCE_METHODS = {
  webhook: {
    'dynamic-list': 'getRows',
    'multi-select-dynamic': 'getRows',
    'cpf-lookup': 'lookup'
  }
}

function isFieldEmpty(val, field, values = {}) {
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
  const [currentPage, setCurrentPage] = useState(0)
  const [fieldErrors, setFieldErrors] = useState({})
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

  const pages = useMemo(() => {
    const result = []
    for (let i = 0; i < visibleFields.length; i += FIELDS_PER_PAGE) {
      result.push(visibleFields.slice(i, i + FIELDS_PER_PAGE))
    }
    return result.length > 0 ? result : [[]]
  }, [visibleFields])

  const totalPages = pages.length
  const currentFields = pages[currentPage] ?? []
  const isLastPage = currentPage === totalPages - 1

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

      Object.entries(extra).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') params.set(k, String(v))
      })

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
      if (field.dependsOn) return
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

  useEffect(() => {
    fields.forEach(async field => {
      if (!field.dependsOn) return
      if (field.type !== 'dynamic-list' && field.type !== 'multi-select-dynamic') return

      const parentValue = values[field.dependsOn]
      if (!parentValue) {
        // Limpa o filho quando pai esvazia
        setOptions(prev => ({ ...prev, [field.id]: [] }))
        setValue(field.id, '')
        return
      }

      const listUrl = field.dataSource?.url || field.dataSource?.webhookUrl
      if (!listUrl) return

      setLoadingOptions(prev => ({ ...prev, [field.id]: true }))
      try {
        const paramName = field.dependsOnParam || 'dependsOnValue'
        const data = await fetchDatasource(field, {
          dependsOnParam: paramName,
          dependsOnValue: parentValue
        })
        setOptions(prev => ({ ...prev, [field.id]: Array.isArray(data) ? data : [] }))
        setValue(field.id, '') // reseta seleção anterior
      } catch {
        setOptions(prev => ({ ...prev, [field.id]: [] }))
      } finally {
        setLoadingOptions(prev => ({ ...prev, [field.id]: false }))
      }
    })
  }, [values, fields, fetchDatasource])

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
          [field.id]: result.value ?? result.cpf ?? cpf,
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

  const validateField = (field, val) => {
    // Só valida se o usuário digitou algo
    if (val === undefined || val === '' || val === null) return

    // Regex — vale para qualquer campo que tenha regex, obrigatório ou não
    const regexError = validateFieldRegex(field, val)
    if (regexError) {
      setFieldErrors(prev => ({ ...prev, [field.id]: regexError }))
      return
    }

    // Sem erro — limpa
    setFieldErrors(prev => ({ ...prev, [field.id]: null }))
  }

  const handleSubmit = async e => {
    e.preventDefault()
    setError(null)

    for (const field of fields) {
      if (!isFieldVisible(field, values)) continue

      if (isFieldRequired(field, values) && isFieldEmpty(values[field.id], field, values)) {
        const msg = `O campo "${field.label}" é obrigatório.`
        setError(msg)
        toast.error(msg, { position: 'bottom-center' })
        return
      }
    }

    for (const field of fields) {
      if ((field.type === 'multi-select-dynamic' || field.type === 'multi-input') && field.extraFields?.length > 0) {
        const items = values[field.id] ?? []
        for (const item of items) {
          for (const ef of field.extraFields) {
            if (ef.required && (item[ef.key] === '' || item[ef.key] === undefined || item[ef.key] === null)) {
              setError(`Preencha "${ef.label}" para todos os itens em "${field.label}".`)
              toast.error(`Preencha "${ef.label}" para todos os itens em "${field.label}".`, {
                position: 'bottom-center'
              })
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
        toast.error(`"${field.label}": ${regexError}`, { position: 'bottom-center' })
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
      toast.error(err.message, { position: 'bottom-center' })
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
    setCurrentPage(0)
    setFieldErrors({})
  }

  const handleNextPage = () => {
    setError(null)

    for (const field of currentFields) {
      if (!isFieldVisible(field, values)) continue
      if (isFieldRequired(field, values) && isFieldEmpty(values[field.id], field, values)) {
        setError(`O campo "${field.label}" é obrigatório.`)
        toast.error(`O campo "${field.label}" é obrigatório.`, { position: 'bottom-center' })
        return
      }
      const regexError = validateFieldRegex(field, values[field.id])
      if (regexError) {
        setError(`"${field.label}": ${regexError}`)
        toast.error(`"${field.label}": ${regexError}`, { position: 'bottom-center' })
        return
      }
    }

    setCurrentPage(prev => prev + 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handlePrevPage = () => {
    setError(null)
    setCurrentPage(prev => prev - 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
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

        {/* Barra de progresso — só aparece se tiver mais de 1 página */}
        {totalPages > 1 && (
          <div className='flex flex-col gap-2 mt-4'>
            <div className='flex items-center justify-between'>
              <span className={formMutedCls}>
                Etapa {currentPage + 1} de {totalPages}
              </span>
              <span className={formMutedCls}>{Math.round(((currentPage + 1) / totalPages) * 100)}%</span>
            </div>
            <div className='w-full h-1.5 rounded-full bg-[var(--mui-palette-divider)]'>
              <div
                className='h-1.5 rounded-full bg-[var(--mui-palette-primary-main)] transition-all duration-300'
                style={{ width: `${((currentPage + 1) / totalPages) * 100}%` }}
              />
            </div>
          </div>
        )}
      </header>

      {error && <div className={`${formAlertErrorCls} ${formFieldsWrapCls}`}>{error}</div>}

      {currentFields.map(field => (
        <FieldInput
          key={field.id}
          field={field}
          value={values[field.id]}
          nameValue={field.returnNameFieldId ? values[field.returnNameFieldId] : undefined}
          options={options[field.id]}
          cpfError={cpfErrors[field.id]}
          fieldError={fieldErrors[field.id]}
          loading={loadingOptions[field.id]}
          onChange={v => setValue(field.id, v)}
          onBlur={() => validateField(field, values[field.id])}
          onClearError={() => setFieldErrors(prev => ({ ...prev, [field.id]: null }))}
          onCpfChange={cpf => handleCpfChange(field, cpf)}
          onCpfLookup={() => handleCpfLookup(field)}
        />
      ))}

      {/* Navegação */}
      <div
        className={`flex items-center gap-3 ${formFieldsWrapCls} ${currentPage > 0 ? 'justify-between' : 'justify-end'}`}
      >
        {currentPage > 0 && (
          <button type='button' onClick={handlePrevPage} className={`${btnSecondary} flex-1`}>
            <i className='tabler-arrow-left text-sm' />
            Anterior
          </button>
        )}

        {isLastPage ? (
          <button type='submit' disabled={submitting} className={`${btnPrimary} flex-1`}>
            {submitting ? <i className='tabler-loader-2 animate-spin' /> : <i className='tabler-send' />}
            {submitting ? 'Enviando...' : 'Enviar'}
          </button>
        ) : (
          <button type='button' onClick={handleNextPage} className={`${btnPrimary} flex-1`}>
            Próximo
            <i className='tabler-arrow-right text-sm' />
          </button>
        )}
      </div>
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

const FieldInput = ({
  field,
  value,
  nameValue,
  options,
  cpfError,
  fieldError,
  loading,
  onChange,
  onBlur,
  onCpfChange,
  onCpfLookup,
  onClearError
}) => {
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
            onChange={e => {
              onChange(e.target.value)
              onClearError?.()
            }}
            onBlur={onBlur}
            placeholder={field.placeholder}
            error={!!fieldError}
            helperText={fieldError ?? ''}
          />
        </FormFieldWrap>
      )
    case 'text':
    case 'number':
      return (
        <FormFieldWrap>
          <FormTextField
            fullWidth
            type={field.type}
            label={field.label}
            required={field.required}
            value={value ?? ''}
            onChange={e => {
              onChange(e.target.value)
              onClearError?.()
            }}
            onBlur={onBlur}
            placeholder={field.placeholder}
            error={!!fieldError}
            helperText={fieldError ?? ''}
          />
        </FormFieldWrap>
      )
    case 'date':
    case 'time':
      return (
        <FormFieldWrap>
          <FormTextField
            fullWidth
            type={field.type}
            label={field.label}
            required={field.required}
            value={value ?? ''}
            onChange={e => {
              onChange(e.target.value)
              onClearError?.()
            }}
            onBlur={onBlur}
            InputLabelProps={{ shrink: true }}
            error={!!fieldError}
            helperText={fieldError ?? ''}
          />
        </FormFieldWrap>
      )
    case 'select':
      return (
        <FormFieldWrap>
          <FormLabel required={field.required}>{field.label}</FormLabel>
          <select value={value ?? ''} onChange={e => onChange(e.target.value)} onBlur={onBlur} className={formInputCls}>
            <option value=''>Selecione...</option>
            {(field.options ?? []).map((opt, idx) => {
              const label = typeof opt === 'object' ? opt.label : opt
              const val = typeof opt === 'object' ? opt.value : opt
              return (
                <option key={idx} value={val}>
                  {label}
                </option>
              )
            })}
          </select>
          {fieldError && <p className={formErrorCls}>{fieldError}</p>}
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
        <DynamicListInput
          field={field}
          value={value}
          options={options}
          loading={loading}
          onChange={onChange}
          onBlur={onBlur}
        />
      )
    case 'multi-select-dynamic':
      return (
        <MultiSelectDynamicInput field={field} value={value} options={options} loading={loading} onChange={onChange} />
      )

    case 'multi-input':
      return <MultiInputField field={field} value={value} onChange={onChange} />

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

    default:
      return (
        <FormFieldWrap>
          <FormTextField
            fullWidth
            label={field.label}
            required={field.required}
            value={value ?? ''}
            onChange={e => {
              onChange(e.target.value)
              onClearError?.()
            }}
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

const DynamicListInput = ({ field, value, options, loading, onChange, onBlur }) => {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  const opts = options ?? []

  useEffect(() => {
    const handle = e => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const q = search.trim().toLowerCase()
  const filtered = q
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

  const selectedLabel = opts.find(o => o.value === value)?.label ?? value ?? ''

  return (
    <FormFieldWrap>
      <FormLabel required={field.required}>{field.label}</FormLabel>
      <div ref={containerRef} className='relative'>
        <i
          className={`tabler-search absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none ${formIconMutedCls}`}
        />
        <input
          type='text'
          value={open ? search : selectedLabel}
          onChange={e => {
            setSearch(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={onBlur}
          placeholder={loading ? 'Carregando...' : 'Buscar...'}
          disabled={loading}
          className={`${formInputCls} pl-9`}
        />
        {open && !loading && (
          <ul className={formDropdownCls} style={{ backgroundColor: 'var(--mui-palette-background-default)' }}>
            {filtered.length === 0 ? (
              <li className={`px-3 py-2 text-sm ${formMutedCls}`}>Nenhuma opção encontrada</li>
            ) : (
              filtered.map(opt => (
                <li key={opt.value}>
                  <button
                    type='button'
                    className={formDropdownItemCls}
                    onClick={() => {
                      onChange(opt.value)
                      setSearch('')
                      setOpen(false)
                    }}
                  >
                    {opt.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </FormFieldWrap>
  )
}

const MultiInputField = ({ field, value, onChange }) => {
  const extraFields = field.extraFields ?? []
  const selected = Array.isArray(value) ? value : []
  const [text, setText] = useState('')

  const addItem = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    const initExtras = Object.fromEntries(extraFields.map(ef => [ef.key, ef.type === 'checkbox' ? false : '']))
    onChange([...selected, { label: trimmed, ...initExtras }])
    setText('')
  }

  const removeAt = index => onChange(selected.filter((_, i) => i !== index))

  const updateExtra = (index, key, val) => {
    onChange(selected.map((item, i) => (i === index ? { ...item, [key]: val } : item)))
  }

  return (
    <FormFieldWrap>
      <FormLabel required={field.required}>{field.label}</FormLabel>

      {/* Input de entrada */}
      <div className='flex gap-2'>
        <input
          type='text'
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addItem())}
          placeholder={field.placeholder ?? 'Digite e pressione adicionar...'}
          className={`${formInputCls} flex-1`}
        />
        <button type='button' onClick={addItem} className={btnPrimarySm}>
          Adicionar
        </button>
      </div>

      {/* Itens adicionados */}
      {selected.length > 0 && (
        <div className='flex flex-col gap-3 mt-3'>
          {selected.map((item, index) => (
            <div
              key={index}
              className='flex flex-col gap-3 p-3 rounded-lg border border-[var(--mui-palette-divider)] bg-[var(--mui-palette-background-paper)]'
            >
              <div className='flex items-center justify-between'>
                <span className={`text-sm font-medium ${formHeadingCls}`}>{item.label}</span>
                <button type='button' onClick={() => removeAt(index)} className={formChipRemoveBtnCls}>
                  <i className='tabler-x text-sm' />
                </button>
              </div>

              {extraFields.length > 0 && (
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
    </FormFieldWrap>
  )
}

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
