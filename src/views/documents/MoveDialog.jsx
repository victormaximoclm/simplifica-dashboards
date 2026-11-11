'use client'

import { useEffect, useMemo, useState } from 'react'

import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'

import { formDividerCls, formMutedCls, formScrollCls } from '@/views/forms/formStyles'

// Mesmo limite validado na API (MAX_FOLDER_DEPTH em src/libs/documentAccess.js)
const MAX_FOLDER_DEPTH = 10
const ROOT = '__root__'

/** Achata a árvore em ordem de exibição: [{ id, name, depth }] (raiz = profundidade 0) */
function flattenTree(folders) {
  const childrenByParent = new Map()

  folders.forEach(folder => {
    const key = folder.parentId ?? ROOT

    childrenByParent.set(key, [...(childrenByParent.get(key) ?? []), folder])
  })

  const rows = []

  const visit = (parentKey, depth) => {
    ;(childrenByParent.get(parentKey) ?? [])
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .forEach(folder => {
        rows.push({ ...folder, depth })
        visit(folder.id, depth + 1)
      })
  }

  visit(ROOT, 1)

  return { rows, childrenByParent }
}

/** Ids da subárvore da pasta e sua altura (a própria pasta = 1) */
function getSubtree(folderId, childrenByParent) {
  const ids = new Set([folderId])
  let level = [folderId]
  let height = 1

  while (level.length) {
    level = level.flatMap(id => (childrenByParent.get(id) ?? []).map(child => child.id))

    if (level.length) {
      level.forEach(id => ids.add(id))
      height++
    }
  }

  return { ids, height }
}

const MoveDialog = ({ item, workspaceId, onClose, onMoved }) => {
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const open = !!item
  const currentParentId = item ? ((item.kind === 'folder' ? item.parentId : item.folderId) ?? null) : null

  useEffect(() => {
    if (!item || !workspaceId) return

    setSelected(null)
    setError('')
    setLoading(true)

    fetch(`/api/documents/folders?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: 'no-store' })
      .then(res => (res.ok ? res.json() : Promise.reject(res)))
      .then(data => setFolders(data.data ?? []))
      .catch(() => setError('Não foi possível carregar as pastas'))
      .finally(() => setLoading(false))
  }, [item, workspaceId])

  const { rows, childrenByParent } = useMemo(() => flattenTree(folders), [folders])

  const subtree = useMemo(
    () => (item?.kind === 'folder' ? getSubtree(item.id, childrenByParent) : { ids: new Set(), height: 0 }),
    [item, childrenByParent]
  )

  /** Motivo para o destino ser inválido, ou '' se puder ser escolhido */
  const getDisabledReason = (targetId, targetDepth) => {
    if (targetId === currentParentId) return 'local atual'
    if (item?.kind !== 'folder') return ''
    if (targetId && subtree.ids.has(targetId)) return 'dentro da própria pasta'
    if (targetDepth + subtree.height > MAX_FOLDER_DEPTH) return 'limite de níveis'

    return ''
  }

  const handleClose = () => {
    if (saving) return
    onClose()
  }

  const handleConfirm = async () => {
    if (selected === null) return

    setSaving(true)
    setError('')

    const targetFolderId = selected === ROOT ? null : selected

    try {
      const res = await fetch(`/api/documents/${item.kind === 'folder' ? 'folders' : 'files'}/${item.id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetFolderId })
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.message || 'Erro ao mover')

        return
      }

      onMoved(`"${item.name}" movido!`)
    } catch {
      setError('Erro de conexão')
    } finally {
      setSaving(false)
    }
  }

  const renderOption = (key, label, depth, reason) => {
    const isSelected = selected === key

    return (
      <button
        key={key}
        type='button'
        disabled={!!reason}
        onClick={() => setSelected(key)}
        style={{ paddingInlineStart: `${12 + depth * 16}px` }}
        className={`flex w-full items-center gap-2 pie-3 py-2 text-sm text-left rounded-lg border-0 transition-colors ${
          isSelected
            ? 'bg-[var(--mui-palette-primary-lightOpacity)] text-[var(--mui-palette-primary-main)] font-medium'
            : 'bg-transparent hover:bg-[var(--mui-palette-action-hover)]'
        } ${reason ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <i className={`${key === ROOT ? 'tabler-home' : 'tabler-folder'} text-base shrink-0`} />
        <span className='truncate'>{label}</span>
        {reason && <span className={`text-xs ${formMutedCls} shrink-0 mis-auto`}>({reason})</span>}
      </button>
    )
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth='sm' fullWidth>
      <DialogTitle>Mover &quot;{item?.name}&quot;</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity='error' sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {loading ? (
          <div className='flex justify-center py-8'>
            <CircularProgress size={28} />
          </div>
        ) : (
          <div className={`max-h-[50vh] overflow-y-auto border rounded-lg p-1 ${formDividerCls} ${formScrollCls}`}>
            {renderOption(ROOT, 'Documentos', 0, getDisabledReason(null, 0))}
            {rows.map(row => renderOption(row.id, row.name, row.depth, getDisabledReason(row.id, row.depth)))}
          </div>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color='secondary' disabled={saving}>
          Cancelar
        </Button>
        <Button onClick={handleConfirm} variant='contained' disabled={saving || selected === null}>
          {saving ? 'Movendo...' : 'Mover aqui'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default MoveDialog
