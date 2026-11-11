'use client'

import { useEffect, useState } from 'react'

import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'

import { DOCUMENT_SITE_TEXT } from '@/libs/documentFileTypes'

function validateName(value) {
  const name = value.trim()

  if (!name) return 'Nome é obrigatório'
  if (name.length > 255) return 'O nome deve ter no máximo 255 caracteres'
  if (/[/\\]/.test(name)) return 'O nome não pode conter / ou \\'

  return ''
}

/**
 * Diálogo de nome: criar pasta (mode 'create') ou renomear pasta/arquivo (mode 'rename').
 */
const NameDialog = ({ state, workspaceId, parentId, onClose, onSaved }) => {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const open = !!state
  const isRename = state?.mode === 'rename'
  const item = state?.item

  useEffect(() => {
    if (!state) return

    setName(state.mode === 'rename' ? state.item.name : '')
    setError('')
  }, [state])

  const handleClose = () => {
    if (saving) return
    onClose()
  }

  const handleSubmit = async event => {
    event.preventDefault()

    const validationError = validateName(name)

    if (validationError) {
      setError(validationError)

      return
    }

    setSaving(true)
    setError('')

    const url = isRename
      ? `/api/documents/${item.kind === 'folder' ? 'folders' : 'files'}/${item.id}`
      : '/api/documents/folders'

    try {
      const res = await fetch(url, {
        method: isRename ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isRename ? { name: name.trim() } : { name: name.trim(), workspaceId, parentId })
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.message || 'Erro ao salvar')

        return
      }

      onSaved(isRename ? 'Nome alterado!' : 'Pasta criada!')
    } catch {
      setError('Erro de conexão')
    } finally {
      setSaving(false)
    }
  }

  const renameTarget = item?.kind === 'folder' ? 'pasta' : item?.isSite ? DOCUMENT_SITE_TEXT.label : 'arquivo'
  const title = isRename ? `Renomear ${renameTarget}` : 'Nova pasta'

  return (
    <Dialog open={open} onClose={handleClose} maxWidth='xs' fullWidth>
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity='error' sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <TextField
            autoFocus
            fullWidth
            label='Nome'
            value={name}
            onChange={e => setName(e.target.value)}
            inputProps={{ maxLength: 255 }}
            helperText={isRename && item?.kind === 'file' && !item?.isSite ? 'A extensão do arquivo é mantida.' : ' '}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} color='secondary' disabled={saving}>
            Cancelar
          </Button>
          <Button type='submit' variant='contained' disabled={saving}>
            {saving ? 'Salvando...' : isRename ? 'Renomear' : 'Criar'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

export default NameDialog
