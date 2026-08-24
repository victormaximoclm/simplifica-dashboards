'use client'

import { useState } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'

const UploadDocumentDialog = ({ open, onClose, folderId, workspaceId }) => {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleClose = () => {
    setFile(null)
    setError('')
    onClose()
  }

  const handleSubmit = async () => {
    if (!file) {
      setError('Selecione um arquivo')
      return
    }

    setLoading(true)
    setError('')

    try {
      const body = new FormData()
      body.append('file', file)

      const res = await fetch(`/api/folders/${folderId}/documents`, {
        method: 'POST',
        body
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Erro ao enviar arquivo')
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
      <DialogTitle>Enviar Arquivo</DialogTitle>
      <DialogContent className='flex flex-col gap-4 pbs-2'>
        <Button variant='outlined' component='label'>
          {file ? file.name : 'Selecionar arquivo'}
          <input type='file' hidden onChange={e => setFile(e.target.files?.[0] ?? null)} />
        </Button>
        {error && (
          <Typography color='error' variant='caption'>
            {error}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading} color='secondary'>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} disabled={loading} variant='contained'>
          {loading ? <CircularProgress size={20} /> : 'Enviar'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default UploadDocumentDialog
