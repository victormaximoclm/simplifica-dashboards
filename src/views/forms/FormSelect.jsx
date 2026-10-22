'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import {
  formDropdownPanelCls,
  formScrollCls,
  formDropdownEmptyCls,
  formDropdownOptionCls,
  formDropdownOptionActiveCls,
  formDropdownOptionSelectedCls,
  formSelectTriggerCls
} from './formStyles'

/**
 * Dropdown próprio do módulo de formulários (substitui o <select> nativo, cuja lista não é estilizável).
 * options: [{ value, label }]; onChange recebe o value escolhido (string).
 */
const FormSelect = ({
  value,
  onChange,
  options = [],
  placeholder = 'Selecione...',
  disabled = false,
  className = '',
  searchable = false
}) => {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const containerRef = useRef(null)
  const listRef = useRef(null)
  const searchRef = useRef(null)

  const current = options.find(o => String(o.value) === String(value ?? ''))

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    return q ? options.filter(o => String(o.label).toLowerCase().includes(q)) : options
  }, [options, search])

  const close = () => {
    setOpen(false)
    setSearch('')
  }

  const openList = () => {
    if (disabled) return
    const idx = options.findIndex(o => String(o.value) === String(value ?? ''))

    setActiveIndex(idx)
    setOpen(true)
  }

  const choose = opt => {
    onChange(opt.value)
    close()
  }

  useEffect(() => {
    if (!open) return

    const handle = e => {
      if (containerRef.current && !containerRef.current.contains(e.target)) close()
    }

    document.addEventListener('mousedown', handle)

    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  useEffect(() => {
    if (open && searchable) searchRef.current?.focus()
  }, [open, searchable])

  // Mantém a opção ativa visível ao navegar pelo teclado
  useEffect(() => {
    if (!open || activeIndex < 0) return
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  const handleKeyDown = e => {
    if (disabled) return

    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        openList()
      }

      return
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' || (e.key === ' ' && !searchable)) {
      e.preventDefault()
      if (filtered[activeIndex]) choose(filtered[activeIndex])
    } else if (e.key === 'Tab') {
      close()
    }
  }

  return (
    <div className='relative' ref={containerRef} onKeyDown={handleKeyDown}>
      <button
        type='button'
        disabled={disabled}
        aria-haspopup='listbox'
        aria-expanded={open}
        onClick={() => (open ? close() : openList())}
        className={`${formSelectTriggerCls} ${className}`}
      >
        <span className={`truncate ${current ? '' : 'text-[var(--mui-palette-text-disabled)]'}`}>
          {current ? current.label : placeholder}
        </span>
        <i className={`tabler-chevron-down text-base shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className={formDropdownPanelCls}>
          {searchable && (
            <div className='px-2 pb-1 pt-1'>
              <input
                ref={searchRef}
                type='text'
                value={search}
                onChange={e => {
                  setSearch(e.target.value)
                  setActiveIndex(0)
                }}
                placeholder='Buscar...'
                className='w-full px-2.5 py-1.5 rounded-md text-sm bg-transparent border border-[var(--mui-palette-divider)] text-[var(--mui-palette-common-white)] focus:outline-none focus:border-[var(--mui-palette-primary-main)]'
              />
            </div>
          )}
          <ul ref={listRef} role='listbox' className={`max-h-52 overflow-y-auto ${formScrollCls}`}>
            {filtered.length === 0 && <li className={formDropdownEmptyCls}>Nenhuma opção</li>}
            {filtered.map((opt, i) => {
              const selected = String(opt.value) === String(value ?? '')

              return (
                <li
                  key={opt.value}
                  role='option'
                  aria-selected={selected}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => choose(opt)}
                  className={[
                    formDropdownOptionCls,
                    selected ? formDropdownOptionSelectedCls : '',
                    i === activeIndex && !selected ? formDropdownOptionActiveCls : ''
                  ].join(' ')}
                >
                  <span className='truncate'>{opt.label}</span>
                  {selected && <i className='tabler-check text-base shrink-0' />}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

export default FormSelect
