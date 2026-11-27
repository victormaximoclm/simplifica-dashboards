'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'

import { createPortal } from 'react-dom'

import {
  formCaptionCls,
  formChipCls,
  formChipRemoveBtnCls,
  formDropdownEmptyCls,
  formDropdownOptionActiveCls,
  formDropdownOptionCls,
  formDropdownOptionSelectedCls,
  formScrollCls
} from './formStyles'

const PANEL_MAX_HEIGHT = 260
const VISIBLE_CHIPS = 6

const triggerCls = [
  'w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition cursor-text',
  'bg-[var(--mui-palette-background-paper)] border-[var(--mui-palette-divider)]',
  'focus-within:border-[var(--mui-palette-primary-main)] focus-within:ring-1 focus-within:ring-[var(--mui-palette-primary-main)]'
].join(' ')

const searchInputCls = [
  'flex-1 min-w-0 bg-transparent border-0 p-0 text-sm outline-none',
  'text-[var(--mui-palette-text-primary)] placeholder:text-[var(--mui-palette-text-disabled)]'
].join(' ')

// Fixo e acima do Dialog do MUI (z 1300): o painel não pode ser cortado pelo scroll do painel lateral nem do diálogo
const panelCls = [
  'fixed z-[1400] rounded-lg py-1 shadow-xl overflow-hidden flex flex-col',
  'border border-[var(--mui-palette-primary-main)] bg-[var(--mui-palette-background-paper)]'
].join(' ')

const bulkRowCls = [
  'flex items-center gap-2 px-3.5 py-2 text-sm font-medium cursor-pointer transition-colors',
  'text-[var(--mui-palette-primary-main)] border-b border-[var(--mui-palette-divider)]'
].join(' ')

const linkBtnCls = [
  'text-xs font-medium cursor-pointer bg-transparent border-0 p-0 rounded',
  'text-[var(--mui-palette-primary-main)] hover:underline',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mui-palette-primary-main)]'
].join(' ')

/**
 * Converte a lista salva em ids de funções existentes. Formulários antigos guardavam o nome da função;
 * valores que não correspondem a nenhuma função do workspace são descartados.
 */
export const toRoleIds = (saved, roles) => {
  const byId = new Set(roles.map(role => role.id))
  const byName = new Map(roles.map(role => [role.name, role.id]))
  const ids = (saved ?? []).map(entry => (byId.has(entry) ? entry : byName.get(entry))).filter(Boolean)

  return [...new Set(ids)]
}

const normalize = text =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

const plural = n => (n === 1 ? '1 função' : `${n} funções`)

/**
 * Escolha de várias funções (cargos) com busca. As escolhidas aparecem como tags abaixo do campo.
 * roles: [{ id, name }]; value: ids escolhidos; onChange recebe o novo array de ids.
 * showAudience: mostra quem vê o recurso (sem função = só administradores).
 */
const RoleMultiSelect = ({
  roles = [],
  value = [],
  onChange,
  placeholder = 'Adicionar função…',
  emptyRolesHint = null,
  showAudience = true,
  audienceNoun = 'este formulário'
}) => {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [position, setPosition] = useState(null)

  const triggerRef = useRef(null)
  const inputRef = useRef(null)
  const panelRef = useRef(null)
  const listRef = useRef(null)
  const listId = useId()

  const selectedSet = useMemo(() => new Set(value), [value])
  const selectedRoles = useMemo(() => roles.filter(role => selectedSet.has(role.id)), [roles, selectedSet])

  const filtered = useMemo(() => {
    const q = normalize(search.trim())

    return q ? roles.filter(role => normalize(role.name).includes(q)) : roles
  }, [roles, search])

  // Ação em lote sobre o que está na lista (todas, ou só as encontradas na busca)
  const filteredAllSelected = filtered.length > 0 && filtered.every(role => selectedSet.has(role.id))
  const showBulk = filtered.length > 1
  const searching = search.trim() !== ''

  let bulkLabel = `Selecionar todas (${filtered.length})`

  if (filteredAllSelected) bulkLabel = searching ? `Remover estas ${filtered.length}` : 'Remover todas'
  else if (searching) bulkLabel = `Selecionar estas ${filtered.length}`

  const rows = useMemo(
    () => [...(showBulk ? [{ bulk: true }] : []), ...filtered.map(role => ({ role }))],
    [showBulk, filtered]
  )

  const toggle = useCallback(
    id => onChange(selectedSet.has(id) ? value.filter(v => v !== id) : [...value, id]),
    [onChange, selectedSet, value]
  )

  const toggleBulk = () => {
    const ids = filtered.map(role => role.id)

    if (filteredAllSelected) {
      const remove = new Set(ids)

      onChange(value.filter(id => !remove.has(id)))
    } else {
      onChange([...value, ...ids.filter(id => !selectedSet.has(id))])
    }
  }

  const activate = row => (row.bulk ? toggleBulk() : toggle(row.role.id))

  const close = () => {
    setOpen(false)
    setSearch('')
  }

  // Posiciona o painel junto ao campo; abre para cima quando falta espaço embaixo
  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect()

    if (!rect) return

    const below = window.innerHeight - rect.bottom - 8
    const above = rect.top - 8
    const up = below < PANEL_MAX_HEIGHT && above > below
    const maxHeight = Math.max(140, Math.min(PANEL_MAX_HEIGHT, up ? above : below))
    const width = Math.min(Math.max(rect.width, 220), window.innerWidth - 16)

    setPosition({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      width,
      maxHeight,
      ...(up ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 })
    })
  }, [])

  const openPanel = () => {
    if (open) return
    place()
    setActiveIndex(0)
    setOpen(true)
  }

  // Acompanha o campo enquanto a página, o painel lateral ou o diálogo rolam
  useEffect(() => {
    if (!open) return

    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)

    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, place])

  useEffect(() => {
    if (!open) return

    const handle = e => {
      if (triggerRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return
      close()
    }

    document.addEventListener('mousedown', handle)

    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  // Mantém a linha ativa visível ao navegar pelo teclado
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  const handleKeyDown = e => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
        e.preventDefault()
        openPanel()
      }

      return
    }

    if (e.key === 'Escape') {
      // Fecha só a lista, sem fechar um diálogo em volta
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, rows.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (rows[activeIndex]) activate(rows[activeIndex])
    } else if (e.key === 'Tab') {
      close()
    }
  }

  if (roles.length === 0) {
    return emptyRolesHint ?? <p className={formCaptionCls}>Nenhuma função cadastrada.</p>
  }

  const hiddenCount = Math.max(0, selectedRoles.length - VISIBLE_CHIPS)
  const visibleChips = expanded ? selectedRoles : selectedRoles.slice(0, VISIBLE_CHIPS)
  const activeRow = rows[activeIndex]
  const activeId = activeRow ? `${listId}-${activeRow.bulk ? 'bulk' : activeRow.role.id}` : undefined

  const panel =
    open && position
      ? createPortal(
          <div
            ref={panelRef}
            className={panelCls}
            style={{
              left: position.left,
              width: position.width,
              maxHeight: position.maxHeight,
              top: position.top,
              bottom: position.bottom
            }}
            // O foco fica no campo de busca (também dentro de diálogos com foco preso)
            onMouseDown={e => e.preventDefault()}
          >
            <ul
              ref={listRef}
              id={listId}
              role='listbox'
              aria-multiselectable='true'
              aria-label='Funções'
              className={`m-0 p-0 list-none min-h-0 overflow-y-auto ${formScrollCls}`}
            >
              {filtered.length === 0 && <li className={formDropdownEmptyCls}>Nenhuma função com “{search.trim()}”</li>}
              {rows.map((row, i) => {
                const active = i === activeIndex

                if (row.bulk) {
                  return (
                    <li
                      key='bulk'
                      id={`${listId}-bulk`}
                      data-index={i}
                      role='option'
                      aria-selected={filteredAllSelected}
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={toggleBulk}
                      className={`${bulkRowCls} ${active ? formDropdownOptionActiveCls : ''}`}
                    >
                      <i className={`${filteredAllSelected ? 'tabler-square-minus' : 'tabler-checks'} text-base`} />
                      {bulkLabel}
                    </li>
                  )
                }

                const selected = selectedSet.has(row.role.id)

                return (
                  <li
                    key={row.role.id}
                    id={`${listId}-${row.role.id}`}
                    data-index={i}
                    role='option'
                    aria-selected={selected}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => toggle(row.role.id)}
                    className={[
                      formDropdownOptionCls,
                      selected ? formDropdownOptionSelectedCls : '',
                      active ? formDropdownOptionActiveCls : ''
                    ].join(' ')}
                  >
                    <span className='truncate'>{row.role.name}</span>
                    {selected && <i className='tabler-check text-base shrink-0' />}
                  </li>
                )
              })}
            </ul>
          </div>,
          document.body
        )
      : null

  return (
    <div className='flex flex-col gap-2.5'>
      <div ref={triggerRef} className={triggerCls} onClick={() => inputRef.current?.focus()}>
        <i className='tabler-search text-base shrink-0 text-[var(--mui-palette-text-disabled)]' />
        <input
          ref={inputRef}
          type='text'
          role='combobox'
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete='list'
          aria-activedescendant={open ? activeId : undefined}
          aria-label='Buscar função'
          value={search}
          placeholder={placeholder}
          onFocus={openPanel}
          onClick={openPanel}
          onChange={e => {
            setSearch(e.target.value)
            setActiveIndex(0)
            openPanel()
          }}
          onKeyDown={handleKeyDown}
          className={searchInputCls}
        />
        <button
          type='button'
          tabIndex={-1}
          aria-label={open ? 'Fechar lista' : 'Abrir lista'}
          onMouseDown={e => e.preventDefault()}
          onClick={e => {
            e.stopPropagation()

            if (open) close()
            else {
              inputRef.current?.focus()
              openPanel()
            }
          }}
          className='shrink-0 flex items-center bg-transparent border-0 p-0 cursor-pointer text-[var(--mui-palette-text-secondary)]'
        >
          <i className={`tabler-chevron-down text-base transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {selectedRoles.length > 0 && (
        <ul className='flex flex-wrap gap-1.5 list-none p-0 m-0' aria-label='Funções escolhidas'>
          {visibleChips.map(role => (
            <li key={role.id} className={`${formChipCls} max-w-full`}>
              <span className='truncate'>{role.name}</span>
              <button
                type='button'
                onClick={() => toggle(role.id)}
                aria-label={`Remover ${role.name}`}
                className={`${formChipRemoveBtnCls} shrink-0 border-0 bg-transparent p-0`}
              >
                <i className='tabler-x text-xs' />
              </button>
            </li>
          ))}
        </ul>
      )}

      {(hiddenCount > 0 || selectedRoles.length > 1) && (
        <div className='flex items-center gap-3'>
          {hiddenCount > 0 && (
            <button type='button' className={linkBtnCls} onClick={() => setExpanded(v => !v)} aria-expanded={expanded}>
              {expanded ? 'Mostrar menos' : `+${plural(hiddenCount)}`}
            </button>
          )}
          {selectedRoles.length > 1 && (
            <button
              type='button'
              className={linkBtnCls}
              onClick={() => {
                onChange([])
                setExpanded(false)
              }}
            >
              Limpar
            </button>
          )}
        </div>
      )}

      {showAudience && (
        <p className={`${formCaptionCls} flex items-start gap-1.5`} aria-live='polite'>
          <i className={`${selectedRoles.length ? 'tabler-eye' : 'tabler-lock'} text-sm shrink-0 mt-px`} />
          {selectedRoles.length
            ? `Visível para administradores e ${plural(selectedRoles.length)}.`
            : `Só administradores veem ${audienceNoun}.`}
        </p>
      )}

      {panel}
    </div>
  )
}

export default RoleMultiSelect
