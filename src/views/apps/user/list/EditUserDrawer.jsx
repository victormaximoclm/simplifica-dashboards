'use client'

// React Imports
import { useEffect, useState } from 'react'

// MUI Imports
import Button from '@mui/material/Button'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import Divider from '@mui/material/Divider'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

const EditUserDrawer = ({ open, handleClose, user, workspaces, callerRole, onSave }) => {
  const [role, setRole] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')
  const [status, setStatus] = useState('')
  const [customRoleId, setCustomRoleId] = useState('')
  const [customRoles, setCustomRoles] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user) {
      setRole(user.role || '')
      setWorkspaceId(user.workspace?.id || '')
      setStatus(user.status || 'pending')
      setCustomRoleId(user.customRole?.id || '')
    }
  }, [user])

  // Fetch custom roles for the workspace
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

  const handleSubmit = async e => {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch(`/api/apps/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role,
          workspaceId: workspaceId || null,
          status,
          customRoleId: role === 'user' ? customRoleId || null : null
        })
      })

      if (res.ok) {
        const updated = await res.json()

        onSave(updated)
        handleClose()
      }
    } finally {
      setLoading(false)
    }
  }

  if (!user) return null

  return (
    <Drawer
      open={open}
      anchor='right'
      variant='temporary'
      onClose={handleClose}
      ModalProps={{ keepMounted: true }}
      sx={{ '& .MuiDrawer-paper': { width: { xs: 300, sm: 400 } } }}
    >
      <div className='flex items-center justify-between plb-5 pli-6'>
        <Typography variant='h5'>Editar Usuário</Typography>
        <IconButton size='small' onClick={handleClose}>
          <i className='tabler-x text-2xl text-textPrimary' />
        </IconButton>
      </div>
      <Divider />
      <form onSubmit={handleSubmit} className='flex flex-col gap-6 p-6'>
        <CustomTextField fullWidth label='Nome' value={user.name || ''} disabled />
        <CustomTextField fullWidth label='Email' value={user.email || ''} disabled />
        <CustomTextField select fullWidth label='Cargo do Sistema' value={role} onChange={e => setRole(e.target.value)}>
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
            <MenuItem value=''>Nenhum</MenuItem>
            {customRoles.map(cr => (
              <MenuItem key={cr.id} value={cr.id}>
                {cr.name}
              </MenuItem>
            ))}
          </CustomTextField>
        )}
        <CustomTextField
          select
          fullWidth
          label='Empresa'
          value={workspaceId}
          onChange={e => setWorkspaceId(e.target.value)}
        >
          <MenuItem value=''>Sem empresa</MenuItem>
          {workspaces.map(ws => (
            <MenuItem key={ws.id} value={ws.id}>
              {ws.name}
            </MenuItem>
          ))}
        </CustomTextField>
        <CustomTextField
          select
          fullWidth
          label='Status'
          value={status}
          onChange={e => setStatus(e.target.value)}
          disabled={user.status === 'pending'}
          helperText={user.status === 'pending' ? 'Usuários pendentes não podem ter o status alterado' : ''}
        >
          <MenuItem value='active'>Ativo</MenuItem>
          <MenuItem value='inactive'>Inativo</MenuItem>
          {user.status === 'pending' && <MenuItem value='pending'>Pendente</MenuItem>}
        </CustomTextField>
        <div className='flex items-center gap-4'>
          <Button variant='contained' type='submit' disabled={loading}>
            {loading ? 'Salvando...' : 'Salvar'}
          </Button>
          <Button variant='tonal' color='error' type='reset' onClick={handleClose}>
            Cancelar
          </Button>
        </div>
      </form>
    </Drawer>
  )
}

export default EditUserDrawer
