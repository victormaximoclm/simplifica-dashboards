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

/** Diálogo de criação do Site: só o nome; a primeira página é criada pelo servidor. */
const NewSiteDialog = ({ open, workspaceId, parentId, onClose, onCreated }) => {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return

    setName('')
    setError('')
  }, [open])

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

    try {
      const res = await fetch('/api/documents/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), workspaceId, folderId: parentId })
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.message || 'Erro ao criar')

        return
      }

      onCreated(data)
    } catch {
      setError('Erro de conexão')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth='xs' fullWidth>
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>{DOCUMENT_SITE_TEXT.newLabel}</DialogTitle>
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
            helperText=' '
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} color='secondary' disabled={saving}>
            Cancelar
          </Button>
          <Button type='submit' variant='contained' disabled={saving}>
            {saving ? 'Criando...' : 'Criar'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

export default NewSiteDialog
