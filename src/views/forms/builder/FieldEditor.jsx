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
  const isFreeList = field.type === 'multi-input'
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

      {![
        'checkbox',
        'date',
        'time',
        'file',
        'dynamic-list',
        'multi-select-dynamic',
        'cpf-lookup',
        'multi-input',
        'address-lookup'
      ].includes(field.type) && (
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

      {(field.type === 'number' || field.type === 'text') && (
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

      {isFreeList && (
        <>
          <Field label='Placeholder do campo de entrada'>
            <input
              type='text'
              value={field.placeholder ?? ''}
              onChange={e => update('placeholder', e.target.value)}
              placeholder='Ex: Digite o nome do produto...'
              className={formInputCls}
            />
          </Field>
          <ExtraFieldsEditor extraFields={field.extraFields ?? []} onChange={list => update('extraFields', list)} />
        </>
      )}

      {field.type === 'select' && (
        <Field label='Opções'>
          <div className='flex flex-col gap-2'>
            {(field.options ?? []).map((opt, idx) => {
              const isObj = typeof opt === 'object'
              const label = isObj ? opt.label : opt
              const value = isObj ? opt.value : opt
              return (
                <div key={idx} className='flex gap-2 items-center'>
                  <input
                    type='text'
                    value={label}
                    onChange={e => {
                      const next = [...(field.options ?? [])]
                      next[idx] = field.useCustomValues
                        ? { label: e.target.value, value: isObj ? opt.value : opt }
                        : e.target.value
                      update('options', next)
                    }}
                    placeholder='Rótulo'
                    className={formInputCls}
                  />
                  {field.useCustomValues && (
                    <input
                      type='text'
                      value={value}
                      onChange={e => {
                        const next = [...(field.options ?? [])]
                        next[idx] = { label, value: e.target.value }
                        update('options', next)
                      }}
                      placeholder='Value'
                      className={`${formInputCls} w-24`}
                    />
                  )}
                  <button
                    type='button'
                    onClick={() =>
                      update(
                        'options',
                        (field.options ?? []).filter((_, i) => i !== idx)
                      )
                    }
                    className={formBuilderIconBtnCls}
                  >
                    <i className='tabler-trash text-sm' />
                  </button>
                </div>
              )
            })}

            <button
              type='button'
              onClick={() =>
                update('options', [...(field.options ?? []), field.useCustomValues ? { label: '', value: '' } : ''])
              }
              className={btnDashed}
            >
              <i className='tabler-plus' /> Adicionar opção
            </button>
          </div>

          <label className='flex items-center gap-2 cursor-pointer mt-2'>
            <div
              onClick={() => {
                const next = !field.useCustomValues
                // Converte opções ao alternar
                const converted = (field.options ?? []).map(opt =>
                  next
                    ? {
                        label: typeof opt === 'object' ? opt.label : opt,
                        value: typeof opt === 'object' ? opt.value : opt
                      }
                    : typeof opt === 'object'
                      ? opt.label
                      : opt
                )
                onChange({ ...field, useCustomValues: next, options: converted })
              }}
              className={`w-10 h-5 rounded-full transition-colors cursor-pointer ${field.useCustomValues ? 'bg-[var(--mui-palette-primary-main)]' : formBuilderToggleOffCls} relative`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 ${formBuilderToggleKnobCls} rounded-full shadow transition-transform ${field.useCustomValues ? 'translate-x-5' : 'translate-x-0.5'}`}
              />
            </div>
            <span className={`text-sm ${formMutedCls}`}>Usar values customizados</span>
          </label>
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
          <DependsOnEditor field={field} allFields={allFields} onChange={onChange} />
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
  if (eligibleFields.length === 0) return null

  // Migração: condition legado → visibility novo
  const visibility =
    field.visibility ??
    (field.condition?.fieldId
      ? {
          operator: 'AND',
          action: 'show',
          rules: [{ fieldId: field.condition.fieldId, op: 'eq', value: field.condition.value ?? '' }]
        }
      : { operator: 'AND', action: 'show', rules: [] })

  const update = patch => onChange({ ...field, visibility: { ...visibility, ...patch }, condition: undefined })
  const updateRule = (i, patch) => {
    const rules = visibility.rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r))
    update({ rules })
  }
  const addRule = () => update({ rules: [...visibility.rules, { fieldId: '', op: 'eq', value: '' }] })
  const removeRule = i => update({ rules: visibility.rules.filter((_, idx) => idx !== i) })

  const getValueOptions = fieldId => {
    const f = eligibleFields.find(x => x.id === fieldId)
    if (!f) return []
    if (f.type === 'checkbox')
      return [
        { label: 'Marcado', value: 'true' },
        { label: 'Desmarcado', value: 'false' }
      ]
    if (f.type === 'select') return (f.options ?? []).map(o => (typeof o === 'object' ? o : { label: o, value: o }))
    return []
  }

  const hasRules = visibility.rules.length > 0

  return (
    <div className='flex flex-col gap-3 pt-3 border-t border-[var(--mui-palette-divider)]'>
      <p className={formBuilderSectionTitleCls}>Exibição condicional</p>

      {/* Sem regras: mostrar botão para iniciar */}
      {!hasRules ? (
        <button type='button' onClick={addRule} className={btnDashed}>
          <i className='tabler-plus' /> Adicionar condição
        </button>
      ) : (
        <>
          {/* Ação + Operador */}
          <div className='flex gap-2'>
            <Field label='Ação'>
              <select
                value={visibility.action}
                onChange={e => update({ action: e.target.value })}
                className={formInputCls}
              >
                <option value='show'>Mostrar</option>
                <option value='hide'>Ocultar</option>
              </select>
            </Field>
            <Field label='Quando'>
              <select
                value={visibility.operator}
                onChange={e => update({ operator: e.target.value })}
                className={formInputCls}
              >
                <option value='AND'>Todas (AND)</option>
                <option value='OR'>Qualquer (OR)</option>
              </select>
            </Field>
          </div>

          {/* Regras */}
          {visibility.rules.map((rule, i) => {
            const valueOptions = getValueOptions(rule.fieldId)
            return (
              <div key={i} className='flex flex-col gap-2 p-3 rounded-lg border border-[var(--mui-palette-divider)]'>
                <div className='flex items-center justify-between'>
                  <span className={formCaptionCls}>Condição {i + 1}</span>
                  <button type='button' onClick={() => removeRule(i)} className={formBuilderIconBtnCls}>
                    <i className='tabler-trash text-sm' />
                  </button>
                </div>

                <Field label='Campo'>
                  <select
                    value={rule.fieldId}
                    onChange={e => updateRule(i, { fieldId: e.target.value, value: '' })}
                    className={formInputCls}
                  >
                    <option value=''>Selecione...</option>
                    {eligibleFields.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label='Operador'>
                  <select
                    value={rule.op}
                    onChange={e => updateRule(i, { op: e.target.value })}
                    className={formInputCls}
                  >
                    <option value='eq'>Igual a</option>
                    <option value='neq'>Diferente de</option>
                    <option value='contains'>Contém</option>
                  </select>
                </Field>

                {rule.fieldId && (
                  <Field label='Valor'>
                    {valueOptions.length > 0 ? (
                      <select
                        value={rule.value}
                        onChange={e => updateRule(i, { value: e.target.value })}
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
                        value={rule.value}
                        onChange={e => updateRule(i, { value: e.target.value })}
                        placeholder='Valor...'
                        className={formInputCls}
                      />
                    )}
                  </Field>
                )}
              </div>
            )
          })}

          <button type='button' onClick={addRule} className={btnDashed}>
            <i className='tabler-plus' /> Adicionar condição
          </button>
        </>
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
    if (f.type === 'select')
      return (f.options ?? []).map(o =>
        typeof o === 'object' ? { label: o.label, value: o.value } : { label: o, value: o }
      )
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

const DependsOnEditor = ({ field, allFields, onChange }) => {
  const eligible = (allFields ?? []).filter(
    f => f.id !== field.id && ['dynamic-list', 'select', 'cpf-lookup'].includes(f.type)
  )
  if (eligible.length === 0) return null

  return (
    <div className='flex flex-col gap-3 pt-3 border-t border-[var(--mui-palette-divider)]'>
      <p className={formBuilderSectionTitleCls}>Dependência (parâmetro dinâmico)</p>
      <p className={formCaptionCls}>
        Ao selecionar um campo pai, este campo só carrega após o pai ter valor, enviando-o como parâmetro{' '}
        <code>dependsOnValue</code> ao webhook.
      </p>

      <Field label='Campo pai'>
        <select
          value={field.dependsOn ?? ''}
          onChange={e => onChange({ ...field, dependsOn: e.target.value || null })}
          className={formInputCls}
        >
          <option value=''>Nenhum (carrega sempre)</option>
          {eligible.map(f => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </Field>

      {field.dependsOn && (
        <Field label='Nome do parâmetro enviado ao webhook'>
          <input
            type='text'
            value={field.dependsOnParam ?? 'dependsOnValue'}
            onChange={e => onChange({ ...field, dependsOnParam: e.target.value })}
            placeholder='dependsOnValue'
            className={formInputCls}
          />
          <p className={`${formCaptionCls} mt-1`}>
            Será enviado como query param: <code>?{field.dependsOnParam || 'dependsOnValue'}=valor_do_pai</code>
          </p>
        </Field>
      )}
    </div>
  )
}

export default FieldEditor
