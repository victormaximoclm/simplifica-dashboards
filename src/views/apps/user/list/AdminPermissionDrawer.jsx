'use client'

import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import Grid from '@mui/material/Grid'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'

const AdminPermissionDrawer = ({ open, handleClose, user, onSave }) => {
  const [permissions, setPermissions] = useState([])
  const [loading, setLoading] = useState(false)

  const modules = [
    { key: 'dashboards', name: 'Dashboards', action: { key: 'share', label: 'Compartilhar' } },
    { key: 'forms', name: 'Formulários', action: { key: 'share', label: 'Compartilhar' } },
    { key: 'users', name: 'Usuários', action: { key: 'manage', label: 'Gerenciar' } }
  ]

  useEffect(() => {
    if (!open || !user) return

    setPermissions([])

    const loadPermissions = async () => {
      const res = await fetch(`/api/apps/users/${user.id}/permissions`)

      if (!res.ok) {
        setPermissions([])
        return
      }

      const data = await res.json()

      setPermissions(data)
    }

    loadPermissions()
  }, [open, user])

  const hasPermission = (moduleKey, action) => {
    return permissions.some(permission => permission.moduleKey === moduleKey && permission.action === action)
  }

  const togglePermission = (moduleKey, action) => {
    const exists = hasPermission(moduleKey, action)

    if (exists) {
      setPermissions(prev =>
        prev.filter(permission => !(permission.moduleKey === moduleKey && permission.action === action))
      )

      return
    }

    setPermissions(prev => [
      ...prev,
      {
        moduleKey,
        action
      }
    ])
  }

  const handleSave = async () => {
    setLoading(true)

    try {
      const res = await fetch(`/api/apps/users/${user.id}/permissions`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          permissions
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.message || 'Erro ao salvar permissões')
      }

      onSave?.(data)
      handleDialogClose()
    } catch (err) {
      onSave?.({
        error: true,
        message: err.message
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDialogClose = () => {
    setPermissions([])
    handleClose()
  }

  if (!user) return null

  return (
    <Dialog open={open} onClose={loading ? undefined : handleDialogClose} fullWidth maxWidth='md'>
      <DialogTitle className='flex items-center justify-between'>
        <Typography variant='h5'>Permissões do Administrador</Typography>

        <IconButton onClick={handleDialogClose} disabled={loading}>
          <i className='tabler-x' />
        </IconButton>
      </DialogTitle>

      <Divider />

      <DialogContent>
        <Typography variant='body2' sx={{ mb: 4 }}>
          Configure quais funcionalidades este administrador poderá acessar.
        </Typography>

        <Paper
          variant='outlined'
          sx={{
            p: 4,
            mb: 4
          }}
        >
          <Typography variant='subtitle1'>Informações</Typography>

          <Typography variant='body2'>
            <strong>Nome:</strong> {user.name}
          </Typography>

          <Typography variant='body2'>
            <strong>Email:</strong> {user.email}
          </Typography>
        </Paper>

        <Grid container spacing={4}>
          {modules.map(module => (
            <Grid item xs={12} md={6} key={module.key}>
              <Paper
                variant='outlined'
                sx={{
                  p: 3,
                  height: '100%'
                }}
              >
                <Typography variant='h6' sx={{ mb: 2 }}>
                  {module.name}
                </Typography>

                {[module.action].map(action => (
                  <FormControlLabel
                    key={action.key}
                    control={
                      <Checkbox
                        checked={hasPermission(module.key, action.key)}
                        onChange={() => togglePermission(module.key, action.key)}
                      />
                    }
                    label={action.label}
                  />
                ))}
              </Paper>
            </Grid>
          ))}
        </Grid>
      </DialogContent>

      <Divider />

      <DialogActions sx={{ px: 6, py: 4 }}>
        <Button variant='tonal' color='error' onClick={handleDialogClose} disabled={loading}>
          Cancelar
        </Button>

        <Button variant='contained' onClick={handleSave} disabled={loading}>
          {loading ? 'Salvando...' : 'Salvar'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default AdminPermissionDrawer
