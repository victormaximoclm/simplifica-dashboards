'use client'

// React Imports
import { useState, useEffect } from 'react'

// MUI Imports
import Button from '@mui/material/Button'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import Divider from '@mui/material/Divider'
import Alert from '@mui/material/Alert'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

const AddUserDrawer = ({ open, handleClose, workspaces, callerRole, onInviteSent }) => {
  const [email, setEmail] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')
  const [role, setRole] = useState('user')
  const [customRoleId, setCustomRoleId] = useState('')
  const [customRoles, setCustomRoles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  // Fetch custom roles when workspace changes
  useEffect(() => {
    if (!workspaceId) {
      setCustomRoles([])

      return
    }

    fetch(`/api/apps/custom-roles?workspaceId=${workspaceId}`)
      .then(res => (res.ok ? res.json() : []))
      .then(data => setCustomRoles(data))
      .catch(() => setCustomRoles([]))
  }, [workspaceId])

  const handleReset = () => {
    setEmail('')
    setWorkspaceId('')
    setRole('user')
    setCustomRoleId('')
    setError(null)
    setSuccess(null)
    handleClose()
  }

  const handleSubmit = async e => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!email || !emailRegex.test(email)) {
      setError('Informe um e-mail válido')

      return
    }

    if (!workspaceId) {
      setError('Selecione um espaço de trabalho')

      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/apps/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, workspaceId, role, customRoleId: role === 'user' ? customRoleId : null })
      })

      const data = await res.json()

      if (!res.ok && !data.emailError) {
        throw new Error(data.message || 'Erro ao enviar convite')
      }

      if (data.emailError) {
        setSuccess('Convite criado, mas não foi possível enviar o e-mail.')
      } else {
        setSuccess(data.message)
      }

      if (onInviteSent) {
        onInviteSent(data.user)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Drawer
      open={open}
      anchor='right'
      variant='temporary'
      onClose={handleReset}
      ModalProps={{ keepMounted: true }}
      sx={{ '& .MuiDrawer-paper': { width: { xs: 300, sm: 400 } } }}
    >
      <div className='flex items-center justify-between plb-5 pli-6'>
        <Typography variant='h5'>Convidar Usuário</Typography>
        <IconButton size='small' onClick={handleReset}>
          <i className='tabler-x text-2xl text-textPrimary' />
        </IconButton>
      </div>
      <Divider />
      <form onSubmit={handleSubmit} className='flex flex-col gap-6 p-6'>
        {error && <Alert severity='error'>{error}</Alert>}
        {success && <Alert severity='success'>{success}</Alert>}
        <CustomTextField
          fullWidth
          type='email'
          label='E-mail do convidado'
          placeholder='usuario@empresa.com'
          value={email}
          onChange={e => setEmail(e.target.value)}
          autoFocus
        />
        <CustomTextField
          select
          fullWidth
          label='Espaço de Trabalho'
          value={workspaceId}
          onChange={e => setWorkspaceId(e.target.value)}
        >
          <MenuItem value='' disabled>
            Selecione...
          </MenuItem>
          {(workspaces || []).map(ws => (
            <MenuItem key={ws.id} value={ws.id}>
              {ws.name}
            </MenuItem>
          ))}
        </CustomTextField>
        <CustomTextField select fullWidth label='Cargo' value={role} onChange={e => setRole(e.target.value)}>
          {callerRole === 'superAdmin' && <MenuItem value='subAdmin'>Sub Admin</MenuItem>}
          <MenuItem value='admin'>Admin</MenuItem>
          <MenuItem value='user'>Usuário</MenuItem>
        </CustomTextField>
        {role === 'user' && (
          <CustomTextField
            select
            fullWidth
            label='Cargo Personalizado'
            value={customRoleId}
            onChange={e => setCustomRoleId(e.target.value)}
            helperText='Define quais dashboards o usuário poderá ver'
          >
            <MenuItem value='' disabled>
              Selecione...
            </MenuItem>
            {customRoles.map(cr => (
              <MenuItem key={cr.id} value={cr.id}>
                {cr.name}
              </MenuItem>
            ))}
          </CustomTextField>
        )}
        <div className='flex items-center gap-4'>
          <Button variant='contained' type='submit' disabled={loading}>
            {loading ? 'Enviando...' : 'Enviar Convite'}
          </Button>
          <Button variant='tonal' color='error' type='reset' onClick={handleReset}>
            Cancelar
          </Button>
        </div>
      </form>
    </Drawer>
  )
}

export default AddUserDrawer
