'use client'

import { useState } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'

const CreateFolderDialog = ({ open, onClose, workspaceId, parentId }) => {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleClose = () => {
    setName('')
    setError('')
    onClose()
  }

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Informe um nome para a pasta')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, parentId, name: name.trim() })
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Erro ao criar pasta')
      }

      window.dispatchEvent(new Event('folders-changed'))
      handleClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth='xs' fullWidth>
      <DialogTitle>Nova Pasta</DialogTitle>
      <DialogContent className='flex flex-col gap-4 pbs-2'>
        <TextField
          autoFocus
          fullWidth
          label='Nome da pasta'
          value={name}
          onChange={e => setName(e.target.value)}
          error={!!error}
          helperText={error}
          disabled={loading}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading} color='secondary'>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} disabled={loading} variant='contained'>
          {loading ? <CircularProgress size={20} /> : 'Criar'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default CreateFolderDialog
