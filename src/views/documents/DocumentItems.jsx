'use client'

import Checkbox from '@mui/material/Checkbox'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'

import DocumentItemMenu from './DocumentItemMenu'
import { formatFileSize, getDocumentItemType } from '@/libs/documentFileTypes'
import { formCardCls, formCardIconBgCls, formMutedCls } from '@/views/forms/formStyles'

// Cor/tamanho explícitos: os utilitários do Tailwind são !important neste projeto (globals.css), então
// combinar formTitleCls (text-2xl) com um tamanho menor não funciona — o text-2xl vence pela ordem do CSS
const itemNameCls = 'text-[var(--mui-palette-text-primary)]'

export function getItemIcon(item) {
  if (item.kind === 'folder') return 'tabler-folder'

  return getDocumentItemType(item)?.icon ?? 'tabler-file'
}

function getItemTypeLabel(item) {
  if (item.kind === 'folder') return 'Pasta'

  return getDocumentItemType(item)?.label ?? 'Arquivo'
}

// O Site não tem arquivo: não exibe tamanho
const getItemSize = item => (item.kind === 'file' && !item.isSite ? formatFileSize(item.size) : '—')

const getItemSubtitle = item => (item.kind === 'folder' || item.isSite ? `${getItemTypeLabel(item)} · ` : `${formatFileSize(item.size)} · `)

const formatDate = value => new Date(value).toLocaleDateString('pt-BR')

const formatLocation = location => ['Documentos', ...location.map(folder => folder.name)].join(' / ')

// Resultado de busca: mostra onde o item está; clicar leva até a pasta que o contém
const ItemLocation = ({ item, onOpenLocation, className = '' }) => {
  if (!item.location) return null

  const label = formatLocation(item.location)
  const target = item.location.length ? item.location[item.location.length - 1].id : null

  return (
    <button
      type='button'
      title={`Abrir ${label}`}
      onClick={() => onOpenLocation(target)}
      className={`flex items-center gap-1 w-full min-w-0 text-left cursor-pointer bg-transparent border-0 p-0 text-xs ${formMutedCls} hover:text-[var(--mui-palette-primary-main)] hover:underline ${className}`}
    >
      <i className='tabler-folder text-sm shrink-0' />
      <span className='min-w-0 truncate'>{label}</span>
    </button>
  )
}

// Só quem gerencia recebe `accessRoles`: cadeado nos itens com cargos próprios (o nome dos cargos fica no title)
const AccessBadge = ({ item }) => {
  if (!item.accessRoles?.length) return null

  return (
    <i
      className={`tabler-lock text-sm shrink-0 ${formMutedCls}`}
      title={`Acesso restrito aos cargos: ${item.accessRoles
        .map(role => `${role.name} (${role.canDownload ? 'ver e baixar' : 'só ver'})`)
        .join(', ')}`}
    />
  )
}

const ellipsis = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

// Com table-layout fixo as larguras vêm do cabeçalho; "Nome" ocupa o restante e trunca nomes longos
const column = (width, breakpoint) => ({
  width,
  ...ellipsis,
  ...(breakpoint && { display: { xs: 'none', [breakpoint]: 'table-cell' } })
})

const COLUMNS = {
  type: column(120, 'sm'),
  size: column(110, 'md'),
  updatedAt: column(140, 'md'),
  createdBy: column(180, 'lg'),
  select: { width: 48, padding: 0 },
  actions: { width: 64 }
}

export const DocumentItemsTable = ({ items, onOpen, onOpenLocation, getOptions, selection = null }) => (
  <div className={`${formCardCls} overflow-hidden`}>
    <Table size='small' sx={{ tableLayout: 'fixed', width: '100%' }}>
      <TableHead>
        <TableRow>
          {selection && (
            <TableCell sx={COLUMNS.select}>
              <Checkbox
                size='small'
                checked={items.length > 0 && items.every(item => selection.isSelected(item))}
                indeterminate={
                  items.some(item => selection.isSelected(item)) && !items.every(item => selection.isSelected(item))
                }
                onChange={() => selection.onToggleAll(items)}
                inputProps={{ 'aria-label': 'Selecionar todos' }}
              />
            </TableCell>
          )}
          <TableCell sx={ellipsis}>Nome</TableCell>
          <TableCell sx={COLUMNS.type}>Tipo</TableCell>
          <TableCell sx={COLUMNS.size}>Tamanho</TableCell>
          <TableCell sx={COLUMNS.updatedAt}>Modificado em</TableCell>
          <TableCell sx={COLUMNS.createdBy}>Criado por</TableCell>
          <TableCell align='right' sx={COLUMNS.actions} />
        </TableRow>
      </TableHead>
      <TableBody>
        {items.map(item => (
          <TableRow
            key={`${item.kind}-${item.id}`}
            hover
            selected={!!selection?.isSelected(item)}
            className={selection?.isSelected(item) ? 'bg-[var(--mui-palette-primary-lightOpacity)]' : ''}
            sx={{ '&:last-child td': { borderBottom: 0 } }}
          >
            {selection && (
              <TableCell sx={COLUMNS.select}>
                <Checkbox
                  size='small'
                  checked={selection.isSelected(item)}
                  onChange={() => selection.onToggle(item)}
                  inputProps={{ 'aria-label': `Selecionar ${item.name}` }}
                />
              </TableCell>
            )}
            <TableCell sx={ellipsis}>
              <button
                type='button'
                title={item.name}
                onClick={() => onOpen(item)}
                className='flex items-center gap-3 w-full min-w-0 text-left cursor-pointer bg-transparent border-0 p-0'
              >
                <i
                  className={`${getItemIcon(item)} text-xl shrink-0 ${
                    item.kind === 'folder' ? 'text-[var(--mui-palette-primary-main)]' : formMutedCls
                  }`}
                />
                <span className={`min-w-0 truncate text-sm font-medium ${itemNameCls}`}>{item.name}</span>
                <AccessBadge item={item} />
              </button>
              <ItemLocation item={item} onOpenLocation={onOpenLocation} className='mt-0.5 ps-8' />
            </TableCell>
            <TableCell sx={COLUMNS.type}>{getItemTypeLabel(item)}</TableCell>
            <TableCell sx={COLUMNS.size}>{getItemSize(item)}</TableCell>
            <TableCell sx={COLUMNS.updatedAt}>{formatDate(item.updatedAt)}</TableCell>
            <TableCell sx={COLUMNS.createdBy} title={item.createdBy?.name || undefined}>
              {item.createdBy?.name || '—'}
            </TableCell>
            <TableCell align='right' sx={COLUMNS.actions}>
              <DocumentItemMenu options={getOptions(item)} label={`Ações de ${item.name}`} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
)

export const DocumentItemsGrid = ({ items, onOpen, onOpenLocation, getOptions, selection = null }) => (
  <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
    {items.map(item => (
      <div
        key={`${item.kind}-${item.id}`}
        className={`group relative min-w-0 overflow-hidden ${formCardCls} p-4 flex items-start gap-3 hover:border-[var(--mui-palette-primary-main)] hover:shadow-md transition-all ${selection?.isSelected(item) ? 'border-[var(--mui-palette-primary-main)] bg-[var(--mui-palette-primary-lightOpacity)]' : ''}`}
      >
        {selection && (
          <Checkbox
            size='small'
            checked={selection.isSelected(item)}
            onChange={() => selection.onToggle(item)}
            inputProps={{ 'aria-label': `Selecionar ${item.name}` }}
            sx={{ p: 0.5, ml: -1, mt: -0.5 }}
          />
        )}
        <div className='flex-1 min-w-0'>
          <button
            type='button'
            title={item.name}
            onClick={() => onOpen(item)}
            className='flex w-full items-start gap-3 min-w-0 text-left cursor-pointer bg-transparent border-0 p-0'
          >
            <div className={`shrink-0 w-10 h-10 rounded-lg ${formCardIconBgCls} flex items-center justify-center`}>
              <i className={`${getItemIcon(item)} text-xl text-[var(--mui-palette-primary-main)]`} />
            </div>
            <div className='flex-1 min-w-0'>
              <h6 className={`flex items-center gap-1.5 text-base font-semibold ${itemNameCls}`}>
                <span className='truncate'>{item.name}</span>
                <AccessBadge item={item} />
              </h6>
              <p className={`text-xs ${formMutedCls} mt-0.5 truncate`}>
                {getItemSubtitle(item)}
                {formatDate(item.updatedAt)}
              </p>
            </div>
          </button>
          <ItemLocation item={item} onOpenLocation={onOpenLocation} className='mt-2' />
        </div>
        <DocumentItemMenu options={getOptions(item)} label={`Ações de ${item.name}`} />
      </div>
    ))}
  </div>
)
