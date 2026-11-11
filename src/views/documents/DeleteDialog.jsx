'use client'

import { useEffect, useState } from 'react'

import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'

import { DOCUMENT_SITE_TEXT } from '@/libs/documentFileTypes'

const plural = (count, singular, pluralLabel) => `${count} ${count === 1 ? singular : pluralLabel}`

const DeleteDialog = ({ item, onClose, onDeleted }) => {
  const [counts, setCounts] = useState(null)
  const [loadingCounts, setLoadingCounts] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const open = !!item
  const isFolder = item?.kind === 'folder'
  const isSite = !!item?.isSite

  useEffect(() => {
    setCounts(null)
    setError('')

    if (!item || item.kind !== 'folder') return

    setLoadingCounts(true)

    fetch(`/api/documents/folders/${item.id}`, { cache: 'no-store' })
      .then(res => (res.ok ? res.json() : Promise.reject(res)))
      .then(data => setCounts(data.counts))
      .catch(() => setError('Não foi possível contar o conteúdo da pasta'))
      .finally(() => setLoadingCounts(false))
  }, [item])

  const handleClose = () => {
    if (deleting) return
    onClose()
  }

  const handleConfirm = async () => {
    setDeleting(true)
    setError('')

    try {
      const res = await fetch(`/api/documents/${isFolder ? 'folders' : 'files'}/${item.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.message || 'Erro ao excluir')

        return
      }

      if (isFolder && data.deleted) {
        onDeleted(
          `Pasta excluída (${plural(data.deleted.folders, 'pasta', 'pastas')} e ${plural(
            data.deleted.files,
            'arquivo',
            'arquivos'
          )})`
        )
      } else {
        onDeleted('Arquivo excluído!')
      }
    } catch {
      setError('Erro de conexão')
    } finally {
      setDeleting(false)
    }
  }

  const hasContent = counts && (counts.folders > 0 || counts.files > 0)

  return (
    <Dialog open={open} onClose={handleClose} maxWidth='sm' fullWidth>
      <DialogTitle sx={{ color: 'error.main', display: 'flex', alignItems: 'center', gap: 2 }}>
        <i className='tabler-alert-triangle' style={{ fontSize: '1.5rem' }} />
        {isFolder ? 'Excluir pasta' : isSite ? DOCUMENT_SITE_TEXT.deleteTitle : 'Excluir arquivo'}
      </DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Tem certeza que deseja excluir {isFolder ? 'a pasta' : isSite ? DOCUMENT_SITE_TEXT.deleteTarget : 'o arquivo'}{' '}
          <strong>&quot;{item?.name}&quot;</strong>? Esta ação não pode ser desfeita.
        </DialogContentText>
        {isSite && <DialogContentText sx={{ color: 'warning.main', mb: 2 }}>{DOCUMENT_SITE_TEXT.deleteWarning}</DialogContentText>}
        {isFolder && loadingCounts && (
          <div className='flex items-center gap-2'>
            <CircularProgress size={16} />
            <DialogContentText>Contando o conteúdo...</DialogContentText>
          </div>
        )}
        {isFolder && hasContent && (
          <DialogContentText sx={{ color: 'warning.main', mb: 2 }}>
            Todo o conteúdo também será excluído: {plural(counts.folders, 'subpasta', 'subpastas')} e{' '}
            {plural(counts.files, 'arquivo', 'arquivos')}.
          </DialogContentText>
        )}
        {error && <DialogContentText sx={{ color: 'error.main' }}>{error}</DialogContentText>}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color='secondary' disabled={deleting}>
          Cancelar
        </Button>
        <Button
          onClick={handleConfirm}
          variant='contained'
          color='error'
          disabled={deleting || (isFolder && loadingCounts)}
        >
          {deleting ? 'Excluindo...' : 'Excluir'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default DeleteDialog
