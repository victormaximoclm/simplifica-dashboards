'use client'

// views/forms/builder/FormBuilder.jsx

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import FieldTypeSelector from './FieldTypeSelector'
import FieldEditor from './FieldEditor'
import { toast } from 'react-toastify'

import {
  btnPrimary,
  btnIcon,
  btnDashed,
  formBuilderAsideCls,
  formBuilderEmptyCls,
  formBuilderFieldRowCls,
  formBuilderFieldRowMetaCls,
  formBuilderFieldRowSelectedCls,
  formBuilderFieldRowTitleCls,
  formCardIconBgCls,
  formBuilderIconBtnCls,
  formBuilderSectionTitleCls,
  formBuilderMainCls,
  formBuilderPanelTitleCls,
  formBuilderShellCls,
  formBuilderTitleInputCls,
  formBuilderToggleKnobCls,
  formBuilderToggleOffCls,
  formCaptionCls,
  formErrorInlineCls,
  formIconMutedCls,
  formInputCls,
  formMutedCls,
  formBuilderFieldLabelCls
} from '../formStyles'

const TYPE_ICONS = {
  'address-lookup': 'tabler-map-pin',
  text: 'tabler-cursor-text',
  textarea: 'tabler-text-wrap',
  number: 'tabler-number',
  date: 'tabler-calendar',
  select: 'tabler-list',
  checkbox: 'tabler-checkbox',
  file: 'tabler-upload',
  'dynamic-list': 'tabler-database',
  'multi-select-dynamic': 'tabler-list-check',
  'cpf-lookup': 'tabler-id',
  time: 'tabler-clock',
  'multi-input': 'tabler-table-plus'
}

const TYPE_LABELS = {
  'address-lookup': 'Endereço',
  text: 'Texto',
  textarea: 'Área de texto',
  number: 'Número',
  date: 'Data',
  select: 'Seleção',
  checkbox: 'Checkbox',
  file: 'Upload',
  'dynamic-list': 'Lista dinâmica',
  'multi-select-dynamic': 'Multi-seleção',
  'cpf-lookup': 'Busca CPF',
  time: 'Hora',
  'multi-input': 'Lista livre'
}

const genId = () => `campo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

const FormBuilder = ({ form, workspaceId, customRoles, lang }) => {
  const router = useRouter()
  const isNew = !form

  const [title, setTitle] = useState(form?.title ?? '')
  const [description, setDescription] = useState(form?.description ?? '')
  const [webhookUrl, setWebhookUrl] = useState(form?.webhookUrl ?? '')
  const [allowPublicLink, setAllowPublicLink] = useState(form?.allowPublicLink ?? false)
  const [allowedCargos, setAllowedCargos] = useState(form?.allowedCargos ?? [])
  const [allowedRoles, setAllowedRoles] = useState(form?.allowedRoles ?? [])
  const [fields, setFields] = useState(form?.fields ?? [])
  const [selectedFieldId, setSelectedFieldId] = useState(null)
  const [showTypeSelector, setShowTypeSelector] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const selectedField = fields.find(f => f.id === selectedFieldId) ?? null

  // Adiciona campo
  const addField = useCallback(type => {
    const newField = {
      id: genId(),
      type,
      label: TYPE_LABELS[type] ?? type,
      required: false,
      ...(type === 'dynamic-list' || type === 'multi-select-dynamic'
        ? { dataSource: { provider: 'webhook', url: '' } }
        : {}),
      ...(type === 'cpf-lookup' ? { dataSource: { provider: 'webhook', url: '' }, returnNameFieldId: '' } : {}),
      ...(type === 'address-lookup' ? {} : {})
    }
    setFields(prev => [...prev, newField])
    setSelectedFieldId(newField.id)
    setShowTypeSelector(false)
  }, [])

  // Atualiza campo
  const updateField = useCallback(updated => {
    setFields(prev => prev.map(f => (f.id === updated.id ? updated : f)))
  }, [])

  // Remove campo
  const removeField = useCallback(id => {
    setFields(prev => prev.filter(f => f.id !== id))
    setSelectedFieldId(prev => (prev === id ? null : prev))
  }, [])

  // Move campo
  const moveField = useCallback((id, dir) => {
    setFields(prev => {
      const idx = prev.findIndex(f => f.id === id)
      if (idx < 0) return prev
      const next = [...prev]
      const swapIdx = dir === 'up' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= next.length) return prev
      ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
      return next
    })
  }, [])

  const toggleRole = roleId => {
    setAllowedRoles(prev => (prev.includes(roleId) ? prev.filter(r => r !== roleId) : [...prev, roleId]))
  }

  const setCargosFromText = text => {
    setAllowedCargos(
      text
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean)
    )
  }

  // Salva
  const handleSave = async () => {
    if (!title.trim()) {
      setError('O título é obrigatório.')
      return
    }
    if (!webhookUrl.trim()) {
      setError('A URL do webhook é obrigatória.')
      return
    }
    if (!workspaceId) {
      setError('Selecione um workspace antes de criar o formulário.')
      return
    }

    const keys = fields.map(f => f.fieldKey?.trim()).filter(Boolean)
    const duplicates = keys.filter((k, i) => keys.indexOf(k) !== i)
    if (duplicates.length > 0) {
      setError(`Chaves duplicadas no payload: ${[...new Set(duplicates)].join(', ')}`)
      return
    }

    setSaving(true)
    setError(null)

    try {
      const payload = {
        title,
        description,
        webhookUrl,
        allowPublicLink,
        allowedCargos,
        allowedRoles,
        fields,
        workspaceId
      }
      const url = isNew ? '/api/forms' : `/api/forms/${form.id}`
      const method = isNew ? 'POST' : 'PUT'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Erro ao salvar formulário')
      }

      const saved = await res.json()
      window.dispatchEvent(new Event('forms-changed'))

      if (isNew) {
        toast.success('Formulário criado com sucesso!')
      } else {
        toast.success('Formulário salvo com sucesso!')
      }

      router.push(`/${lang}/forms/${saved.id}/edit`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className='flex flex-col h-[calc(100vh-64px)]'>
      {/* Topbar */}
      <div
        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 shrink-0 ${formBuilderShellCls}`}
      >
        <div className='flex items-center gap-3 min-w-0 flex-1'>
          <button type='button' onClick={() => router.push(`/${lang}/forms`)} className={btnIcon} aria-label='Voltar'>
            <i className='tabler-arrow-left text-lg' />
          </button>
          <input
            type='text'
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder='Título do formulário'
            className={formBuilderTitleInputCls}
          />
        </div>

        <div className='flex items-center gap-2 flex-wrap shrink-0'>
          {error && <span className={formErrorInlineCls}>{error}</span>}
          <button
            type='button'
            onClick={handleSave}
            disabled={saving}
            className={`${btnPrimary} disabled:opacity-50 w-full sm:w-auto`}
          >
            {saving ? <i className='tabler-loader-2 animate-spin' /> : <i className='tabler-device-floppy' />}
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* Layout: Settings | Canvas | Editor */}
      <div className='flex flex-col lg:flex-row flex-1 overflow-hidden min-h-0'>
        {/* Painel esquerdo — configurações do form */}
        <aside
          className={`w-full lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r flex flex-col gap-5 p-4 sm:p-5 overflow-y-auto max-h-64 lg:max-h-none ${formBuilderAsideCls}`}
        >
          <Section title='Geral'>
            <Field label='Descrição'>
              <textarea
                rows={3}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder='Descrição opcional...'
                className={`${inputCls} resize-none`}
              />
            </Field>
            <Field label='Webhook (n8n)'>
              <input
                type='text'
                value={webhookUrl}
                onChange={e => setWebhookUrl(e.target.value)}
                placeholder='https://...'
                className={inputCls}
              />
            </Field>
          </Section>

          <Section title='Link público'>
            <label className='flex items-center gap-2 cursor-pointer'>
              <Toggle value={allowPublicLink} onChange={setAllowPublicLink} />
              <span className={formMutedCls}>Permitir link público</span>
            </label>
          </Section>

          <Section title='Cargos ClickUp (integração)'>
            <p className={`${formCaptionCls} mb-1`}>
              Um cargo por linha. Sem cargo nem função = somente Super Admin e Sub Admin.
            </p>
            <textarea
              rows={4}
              value={allowedCargos.join('\n')}
              onChange={e => setCargosFromText(e.target.value)}
              placeholder={'Gerente\nAnalista'}
              className={`${inputCls} resize-none`}
            />
          </Section>

          <Section title='Funções (sem ClickUp)'>
            {customRoles.length === 0 ? (
              <p className={formCaptionCls}>Nenhuma função cadastrada.</p>
            ) : (
              <ul className='flex flex-col gap-1.5 list-none p-0 m-0'>
                {customRoles.map(role => (
                  <li key={role.id}>
                    <label className='flex items-center gap-2 cursor-pointer'>
                      <input
                        type='checkbox'
                        checked={allowedRoles.includes(role.id) || allowedRoles.includes(role.name)}
                        onChange={() => toggleRole(role.id)}
                        className='accent-[var(--mui-palette-primary-main)]'
                      />
                      <span className={formMutedCls}>{role.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </aside>

        {/* Canvas central — lista de campos */}
        <main className={`flex-1 overflow-y-auto p-4 sm:p-6 min-h-[200px] ${formBuilderMainCls}`}>
          <div className='max-w-2xl mx-auto flex flex-col gap-3'>
            {fields.length === 0 && (
              <div className={formBuilderEmptyCls}>
                <i className={`tabler-forms text-4xl ${formIconMutedCls}`} />
                <p className={formCaptionCls}>Nenhum campo ainda. Adicione o primeiro.</p>
              </div>
            )}

            {fields.map((field, idx) => (
              <FieldRow
                key={field.id}
                field={field}
                isSelected={selectedFieldId === field.id}
                onSelect={() => setSelectedFieldId(field.id)}
                onRemove={() => removeField(field.id)}
                onMoveUp={() => moveField(field.id, 'up')}
                onMoveDown={() => moveField(field.id, 'down')}
                isFirst={idx === 0}
                isLast={idx === fields.length - 1}
              />
            ))}

            <button type='button' onClick={() => setShowTypeSelector(true)} className={btnDashed}>
              <i className='tabler-plus' />
              Adicionar campo
            </button>
          </div>
        </main>

        {/* Painel direito — editor do campo */}
        <aside
          className={`w-full lg:w-72 shrink-0 border-t lg:border-t-0 lg:border-l overflow-hidden min-h-[240px] lg:min-h-0 ${formBuilderAsideCls}`}
        >
          <FieldEditor
            field={selectedField}
            onChange={updateField}
            onClose={() => setSelectedFieldId(null)}
            allFields={fields}
          />
        </aside>
      </div>

      {/* Modal de seleção de tipo */}
      {showTypeSelector && <FieldTypeSelector onSelect={addField} onClose={() => setShowTypeSelector(false)} />}
    </div>
  )
}

// Sub: linha de campo no canvas
const FieldRow = ({ field, isSelected, onSelect, onRemove, onMoveUp, onMoveDown, isFirst, isLast }) => (
  <div onClick={onSelect} className={`group ${isSelected ? formBuilderFieldRowSelectedCls : formBuilderFieldRowCls}`}>
    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${formCardIconBgCls}`}>
      <i className={`${TYPE_ICONS[field.type] ?? 'tabler-forms'} text-sm text-[var(--mui-palette-primary-main)]`} />
    </div>

    <div className='flex-1 min-w-0'>
      <p className={formBuilderFieldRowTitleCls}>{field.label}</p>
      <p className={formBuilderFieldRowMetaCls}>
        {TYPE_LABELS[field.type] ?? field.type}
        {field.required ? ' · Obrigatório' : ''}
      </p>
    </div>

    <div className='flex items-center gap-1 opacity-0 group-hover:opacity-100 transition'>
      {!isFirst && (
        <IconBtn
          icon='tabler-chevron-up'
          onClick={e => {
            e.stopPropagation()
            onMoveUp()
          }}
        />
      )}
      {!isLast && (
        <IconBtn
          icon='tabler-chevron-down'
          onClick={e => {
            e.stopPropagation()
            onMoveDown()
          }}
        />
      )}
      <IconBtn
        icon='tabler-trash'
        onClick={e => {
          e.stopPropagation()
          onRemove()
        }}
      />
    </div>
  </div>
)

const IconBtn = ({ icon, onClick }) => (
  <button type='button' onClick={onClick} className={formBuilderIconBtnCls}>
    <i className={`${icon} text-sm`} />
  </button>
)

const Toggle = ({ value, onChange }) => (
  <div
    onClick={() => onChange(!value)}
    className={`w-10 h-5 rounded-full transition-colors cursor-pointer ${value ? 'bg-[var(--mui-palette-primary-main)]' : formBuilderToggleOffCls} relative`}
  >
    <span
      className={`absolute top-0.5 w-4 h-4 ${formBuilderToggleKnobCls} rounded-full shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`}
    />
  </div>
)

const Section = ({ title, children }) => (
  <div className='flex flex-col gap-3'>
    <p className={formBuilderSectionTitleCls}>{title}</p>
    {children}
  </div>
)

const Field = ({ label, children }) => (
  <div className='flex flex-col gap-1.5'>
    <label className={formBuilderFieldLabelCls}>{label}</label>
    {children}
  </div>
)

const inputCls = formInputCls

export default FormBuilder
