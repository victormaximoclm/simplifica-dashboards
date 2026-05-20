'use client'

import {
  btnIcon,
  formBuilderFieldLabelCls,
  formBuilderPanelTitleCls,
  formBuilderToggleKnobCls,
  formBuilderToggleOffCls,
  formCaptionCls,
  formIconMutedCls,
  formInputCls,
  formMutedCls,
  formBuilderSectionTitleCls,
  btnDashed,
  formBuilderIconBtnCls
} from '../formStyles'

const WEBHOOK_LIST_FIELDS = [
  { key: 'url', label: 'Webhook (lista)', placeholder: 'https://n8n.dominio.com/webhook/lista' }
]

const WEBHOOK_CPF_FIELDS = [
  { key: 'url', label: 'Webhook (busca CPF)', placeholder: 'https://n8n.dominio.com/webhook/busca-cpf' }
]

const FieldEditor = ({ field, onChange, onClose, allFields }) => {
  if (!field) {
    return (
      <div className='flex flex-col items-center justify-center h-full gap-3 text-center px-6'>
        <i className={`tabler-cursor-text text-4xl ${formIconMutedCls}`} />
        <p className={formCaptionCls}>Selecione um campo para editar suas propriedades</p>
      </div>
    )
  }

  const update = (key, value) => onChange({ ...field, [key]: value })
  const updateDataSource = (key, value) => onChange({ ...field, dataSource: { ...field.dataSource, [key]: value } })

  const isWebhookList = field.type === 'dynamic-list' || field.type === 'multi-select-dynamic'
  const isCpfLookup = field.type === 'cpf-lookup'

  return (
    <div className='flex flex-col gap-5 p-4 sm:p-5 overflow-y-auto h-full'>
      <header className='flex items-center justify-between'>
        <h6 className={formBuilderPanelTitleCls}>Propriedades do campo</h6>
        <button type='button' onClick={onClose} className={btnIcon} aria-label='Fechar'>
          <i className='tabler-x text-lg' />
        </button>
      </header>

      <Field label='Rótulo'>
        <input
          type='text'
          value={field.label ?? ''}
          onChange={e => update('label', e.target.value)}
          placeholder='Ex: Nome completo'
          className={formInputCls}
        />
      </Field>

      <Field label='Chave no payload (fieldKey)'>
        <input
          type='text'
          value={field.fieldKey ?? ''}
          onChange={e => update('fieldKey', e.target.value.replace(/\s/g, '_').toLowerCase())}
          placeholder='ex: solicitante, cpf_paciente'
          className={formInputCls}
        />
        <p className={`${formCaptionCls} mt-1`}>Nome da chave enviada ao n8n. Se vazio, usa o ID gerado.</p>
      </Field>

      {!['checkbox', 'date', 'time', 'file', 'dynamic-list', 'multi-select-dynamic', 'cpf-lookup'].includes(
        field.type
      ) && (
        <Field label='Placeholder'>
          <input
            type='text'
            value={field.placeholder ?? ''}
            onChange={e => update('placeholder', e.target.value)}
            placeholder='Texto de exemplo...'
            className={formInputCls}
          />
        </Field>
      )}

      {field.type === 'number' && (
        <>
          <Field label='Regex de validação'>
            <input
              type='text'
              value={field.validation?.regex ?? ''}
              onChange={e => update('validation', { ...field.validation, regex: e.target.value })}
              placeholder='Ex: ^\d{3}\.\d{3}\.\d{3}-\d{2}$'
              className={formInputCls}
            />
          </Field>
          <Field label='Mensagem de erro'>
            <input
              type='text'
              value={field.validation?.message ?? ''}
              onChange={e => update('validation', { ...field.validation, message: e.target.value })}
              placeholder='Ex: CPF inválido'
              className={formInputCls}
            />
          </Field>
        </>
      )}

      <Field label='Obrigatório'>
        <label className='flex items-center gap-2 cursor-pointer'>
          <div
            onClick={() => update('required', !field.required)}
            className={`w-10 h-5 rounded-full transition-colors cursor-pointer ${field.required ? 'bg-[var(--mui-palette-primary-main)]' : formBuilderToggleOffCls} relative`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 ${formBuilderToggleKnobCls} rounded-full shadow transition-transform ${field.required ? 'translate-x-5' : 'translate-x-0.5'}`}
            />
          </div>
          <span className={`text-sm ${formMutedCls}`}>{field.required ? 'Sim' : 'Não'}</span>
        </label>
      </Field>

      {field.type === 'select' && (
        <Field label='Opções (uma por linha)'>
          <textarea
            rows={4}
            value={(field.options ?? []).join('\n')}
            onChange={e => update('options', e.target.value.split('\n'))}
            placeholder={'Opção 1\nOpção 2'}
            className={`${formInputCls} resize-none`}
          />
        </Field>
      )}

      {field.type === 'file' && (
        <Field label='Tipos aceitos'>
          <input
            type='text'
            value={field.accept ?? ''}
            onChange={e => update('accept', e.target.value)}
            placeholder='Ex: .pdf,.png,.jpg'
            className={formInputCls}
          />
        </Field>
      )}

      {isWebhookList && (
        <>
          <DataSourceEditor
            dataSource={{ provider: 'webhook', ...field.dataSource }}
            onChange={updateDataSource}
            fields={WEBHOOK_LIST_FIELDS}
          />

          <ExtraFieldsEditor extraFields={field.extraFields ?? []} onChange={list => update('extraFields', list)} />
        </>
      )}

      {isCpfLookup && (
        <>
          <DataSourceEditor
            dataSource={{ provider: 'webhook', ...field.dataSource }}
            onChange={updateDataSource}
            fields={WEBHOOK_CPF_FIELDS}
          />
          <Field label='Chave do nome no envio (returnNameFieldId)'>
            <input
              type='text'
              value={field.returnNameFieldId ?? ''}
              onChange={e => update('returnNameFieldId', e.target.value)}
              placeholder='Ex: nome_paciente'
              className={formInputCls}
            />
            <p className={`${formCaptionCls} mt-1`}>
              ID usado no payload do submit para o nome retornado pelo webhook.
            </p>
          </Field>
        </>
      )}
      <ConditionalEditor field={field} allFields={allFields} onChange={onChange} />
      <RequiredConditionEditor field={field} allFields={allFields} onChange={onChange} />
    </div>
  )
}

const DataSourceEditor = ({ dataSource, onChange, fields }) => (
  <>
    {fields.map(f => (
      <Field key={f.key} label={f.label}>
        <input
          type='text'
          value={dataSource[f.key] ?? dataSource.webhookUrl ?? ''}
          onChange={e => onChange(f.key, e.target.value)}
          placeholder={f.placeholder}
          className={formInputCls}
        />
      </Field>
    ))}
  </>
)

const EXTRA_FIELD_TYPES = ['text', 'number', 'select', 'checkbox']
const genExtraId = () => `ef_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

const ExtraFieldsEditor = ({ extraFields, onChange }) => {
  const addExtra = () => {
    onChange([...extraFields, { id: genExtraId(), key: '', label: '', type: 'text', required: false, options: [] }])
  }

  const updateExtra = (id, patch) => {
    onChange(extraFields.map(f => (f.id === id ? { ...f, ...patch } : f)))
  }

  const removeExtra = id => onChange(extraFields.filter(f => f.id !== id))

  return (
    <div className='flex flex-col gap-3 pt-3 border-t border-[var(--mui-palette-divider)]'>
      <p className={formBuilderSectionTitleCls}>Campos extras por item</p>

      {extraFields.length === 0 && (
        <p className={formCaptionCls}>Nenhum campo extra. Itens selecionados só terão o valor da lista.</p>
      )}

      {extraFields.map((ef, idx) => (
        <div key={ef.id} className='flex flex-col gap-2 p-3 rounded-lg border border-[var(--mui-palette-divider)]'>
          <div className='flex items-center justify-between'>
            <span className={formCaptionCls}>Campo extra {idx + 1}</span>
            <button type='button' onClick={() => removeExtra(ef.id)} className={formBuilderIconBtnCls}>
              <i className='tabler-trash text-sm' />
            </button>
          </div>

          <Field label='Chave (key no payload)'>
            <input
              type='text'
              value={ef.key}
              onChange={e => updateExtra(ef.id, { key: e.target.value })}
              placeholder='ex: quantidade'
              className={formInputCls}
            />
          </Field>

          <Field label='Rótulo'>
            <input
              type='text'
              value={ef.label}
              onChange={e => updateExtra(ef.id, { label: e.target.value })}
              placeholder='ex: Quantidade'
              className={formInputCls}
            />
          </Field>

          <Field label='Tipo'>
            <select
              value={ef.type}
              onChange={e => updateExtra(ef.id, { type: e.target.value })}
              className={formInputCls}
            >
              {EXTRA_FIELD_TYPES.map(t => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>

          {ef.type === 'select' && (
            <Field label='Opções (uma por linha)'>
              <textarea
                rows={3}
                value={(ef.options ?? []).join('\n')}
                onChange={e => updateExtra(ef.id, { options: e.target.value.split('\n').filter(Boolean) })}
                className={`${formInputCls} resize-none`}
              />
            </Field>
          )}

          <label className='flex items-center gap-2 cursor-pointer'>
            <input
              type='checkbox'
              checked={!!ef.required}
              onChange={e => updateExtra(ef.id, { required: e.target.checked })}
              className='accent-[var(--mui-palette-primary-main)]'
            />
            <span className={formCaptionCls}>Obrigatório</span>
          </label>
        </div>
      ))}

      <button type='button' onClick={addExtra} className={btnDashed}>
        <i className='tabler-plus' />
        Adicionar campo extra
      </button>
    </div>
  )
}

const Field = ({ label, children }) => (
  <div className='flex flex-col gap-1.5'>
    <label className={formBuilderFieldLabelCls}>{label}</label>
    {children}
  </div>
)

const CONDITIONAL_TYPES = new Set(['select', 'dynamic-list', 'checkbox'])

const ConditionalEditor = ({ field, allFields, onChange }) => {
  const eligibleFields = (allFields ?? []).filter(f => f.id !== field.id && CONDITIONAL_TYPES.has(f.type))

  const condition = field.condition ?? null
  const controllerField = eligibleFields.find(f => f.id === condition?.fieldId)

  const setConditionField = fieldId => {
    if (!fieldId) {
      onChange({ ...field, condition: null })
      return
    }
    onChange({ ...field, condition: { fieldId, value: '' } })
  }

  const setConditionValue = value => {
    onChange({ ...field, condition: { ...condition, value } })
  }

  if (eligibleFields.length === 0) return null

  // Opções de valor baseadas no tipo do campo controlador
  const getValueOptions = f => {
    if (!f) return []
    if (f.type === 'checkbox')
      return [
        { label: 'Marcado', value: 'true' },
        { label: 'Desmarcado', value: 'false' }
      ]
    if (f.type === 'select') return (f.options ?? []).map(o => ({ label: o, value: o }))
    if (f.type === 'dynamic-list') return [] // valor livre, sem opções fixas
    return []
  }

  const valueOptions = getValueOptions(controllerField)

  return (
    <div className='flex flex-col gap-3 pt-3 border-t border-[var(--mui-palette-divider)]'>
      <p className={formBuilderSectionTitleCls}>Exibição condicional</p>

      <Field label='Mostrar este campo somente se'>
        <select
          value={condition?.fieldId ?? ''}
          onChange={e => setConditionField(e.target.value)}
          className={formInputCls}
        >
          <option value=''>Sempre visível</option>
          {eligibleFields.map(f => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </Field>

      {condition?.fieldId && (
        <Field label='For igual a'>
          {valueOptions.length > 0 ? (
            <select
              value={condition.value ?? ''}
              onChange={e => setConditionValue(e.target.value)}
              className={formInputCls}
            >
              <option value=''>Selecione...</option>
              {valueOptions.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type='text'
              value={condition.value ?? ''}
              onChange={e => setConditionValue(e.target.value)}
              placeholder='Valor esperado...'
              className={formInputCls}
            />
          )}
        </Field>
      )}
    </div>
  )
}

const RequiredConditionEditor = ({ field, allFields, onChange }) => {
  if (!field) return null

  const eligibleFields = (allFields ?? []).filter(f => f.id !== field.id && CONDITIONAL_TYPES.has(f.type))

  if (eligibleFields.length === 0) return null

  const req = field.requiredCondition ?? null
  const controllerField = eligibleFields.find(f => f.id === req?.fieldId)

  const setReqField = fieldId => {
    if (!fieldId) {
      onChange({ ...field, requiredCondition: null })
      return
    }
    onChange({ ...field, requiredCondition: { fieldId, value: '' } })
  }

  const setReqValue = value => {
    onChange({ ...field, requiredCondition: { ...req, value } })
  }

  const getValueOptions = f => {
    if (!f) return []
    if (f.type === 'checkbox')
      return [
        { label: 'Marcado', value: 'true' },
        { label: 'Desmarcado', value: 'false' }
      ]
    if (f.type === 'select') return (f.options ?? []).map(o => ({ label: o, value: o }))
    if (f.type === 'dynamic-list') return []
    return []
  }

  const valueOptions = getValueOptions(controllerField)

  return (
    <div className='flex flex-col gap-3 pt-3 border-t border-[var(--mui-palette-divider)]'>
      <p className={formBuilderSectionTitleCls}>Obrigatoriedade condicional</p>
      <p className={formCaptionCls}>Este campo se torna obrigatório somente se a condição abaixo for atendida.</p>

      <Field label='Obrigatório somente se'>
        <select value={req?.fieldId ?? ''} onChange={e => setReqField(e.target.value)} className={formInputCls}>
          <option value=''>Nunca (usa config. base)</option>
          {eligibleFields.map(f => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </Field>

      {req?.fieldId && (
        <Field label='For igual a'>
          {valueOptions.length > 0 ? (
            <select value={req.value ?? ''} onChange={e => setReqValue(e.target.value)} className={formInputCls}>
              <option value=''>Selecione...</option>
              {valueOptions.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type='text'
              value={req.value ?? ''}
              onChange={e => setReqValue(e.target.value)}
              placeholder='Valor esperado...'
              className={formInputCls}
            />
          )}
        </Field>
      )}
    </div>
  )
}

export default FieldEditor
