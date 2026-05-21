'use client'

import {
  btnIcon,
  formBuilderModalCls,
  formBuilderModalOverlayCls,
  formBuilderPanelTitleCls,
  formBuilderSectionTitleCls,
  formBuilderTypeBtnCls,
  formBuilderTypeBtnIconWrapCls,
  formBuilderTypeBtnLabelCls,
  formDividerCls
} from '../formStyles'

const FIELD_TYPES = [
  { type: 'text', label: 'Texto', icon: 'tabler-cursor-text', group: 'Básico' },
  { type: 'textarea', label: 'Área de texto', icon: 'tabler-text-wrap', group: 'Básico' },
  { type: 'number', label: 'Número', icon: 'tabler-number', group: 'Básico' },
  { type: 'date', label: 'Data', icon: 'tabler-calendar', group: 'Básico' },
  { type: 'time', label: 'Hora', icon: 'tabler-clock', group: 'Básico' },
  { type: 'select', label: 'Seleção', icon: 'tabler-list', group: 'Básico' },
  { type: 'checkbox', label: 'Checkbox', icon: 'tabler-checkbox', group: 'Básico' },
  { type: 'file', label: 'Upload de arquivo', icon: 'tabler-upload', group: 'Básico' },
  { type: 'dynamic-list', label: 'Lista dinâmica', icon: 'tabler-database', group: 'Avançado' },
  { type: 'multi-select-dynamic', label: 'Multi-seleção dinâmica', icon: 'tabler-list-check', group: 'Avançado' },
  { type: 'cpf-lookup', label: 'Busca por CPF', icon: 'tabler-id', group: 'Avançado' },
  { type: 'multi-input', label: 'Lista Livre', icon: 'tabler-table-plus', group: 'Básico' }
]

const GROUPS = ['Básico', 'Avançado']

const FieldTypeSelector = ({ onSelect, onClose }) => {
  return (
    <div className={formBuilderModalOverlayCls}>
      <div className={`${formBuilderModalCls} w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col`}>
        <div className={`flex items-center justify-between px-6 py-4 border-b ${formDividerCls}`}>
          <h5 className={formBuilderPanelTitleCls}>Adicionar campo</h5>
          <button type='button' onClick={onClose} className={btnIcon} aria-label='Fechar'>
            <i className='tabler-x text-lg' />
          </button>
        </div>

        <div className='p-4 sm:p-6 flex flex-col gap-5 overflow-y-auto'>
          {GROUPS.map(group => (
            <div key={group}>
              <p className={`${formBuilderSectionTitleCls} mb-3`}>{group}</p>
              <div className='grid grid-cols-2 gap-2'>
                {FIELD_TYPES.filter(f => f.group === group).map(field => (
                  <button
                    key={field.type}
                    type='button'
                    onClick={() => onSelect(field.type)}
                    className={formBuilderTypeBtnCls}
                  >
                    <div className={formBuilderTypeBtnIconWrapCls}>
                      <i className={`${field.icon} text-[var(--mui-palette-primary-main)]`} />
                    </div>
                    <span className={formBuilderTypeBtnLabelCls}>{field.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default FieldTypeSelector
