'use client'

// React Imports
import { useEffect, useState } from 'react'

// MUI Imports
import Snackbar from '@mui/material/Snackbar'
import Button from '@mui/material/Button'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import Divider from '@mui/material/Divider'
import Alert from '@mui/material/Alert'
import InputAdornment from '@mui/material/InputAdornment'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'
import AdminPermissionDrawer from './AdminPermissionDrawer'

const EditUserDrawer = ({ open, handleClose, user, workspaces, callerRole, callerEmail, onSave }) => {
  const [role, setRole] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')
  const [status, setStatus] = useState('')
  const [customRoleId, setCustomRoleId] = useState('')
  const [customRoles, setCustomRoles] = useState([])
  const [loading, setLoading] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState(null)
  const [passwordErr, setPasswordErr] = useState(null)
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [permissionDrawerOpen, setPermissionDrawerOpen] = useState(false)
  const [snackbar, setSnackbar] = useState({
    open: false,
    severity: 'success',
    message: ''
  })

  useEffect(() => {
    if (user) {
      setRole(user.role || '')
      setWorkspaceId(user.workspace?.id || '')
      setStatus(user.status || 'pending')
      setCustomRoleId(user.customRole?.id || '')
      setNewPassword('')
      setPasswordMsg(null)
      setPasswordErr(null)
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

  const isHighAdminCaller = callerRole === 'superAdmin' || callerRole === 'subAdmin'
  const isSelf = user.email === callerEmail

  // Super Admin cannot change their own role
  const canChangeRole = !(callerRole === 'superAdmin' && isSelf)

  // SubAdmin can only reset passwords for admin/user, not superAdmin/subAdmin
  const canResetPassword =
    isHighAdminCaller &&
    !isSelf &&
    !(callerRole === 'subAdmin' && (user.role === 'superAdmin' || user.role === 'subAdmin'))

  const handleResetPassword = async () => {
    setPasswordMsg(null)
    setPasswordErr(null)

    if (!newPassword || newPassword.length < 6) {
      setPasswordErr('Nova senha deve ter pelo menos 6 caracteres')

      return
    }

    setPasswordLoading(true)

    try {
      const res = await fetch(`/api/apps/users/${user.id}/reset-password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword })
      })

      const data = await res.json()

      if (!res.ok) throw new Error(data.message || 'Erro ao alterar senha')

      setPasswordMsg('Senha alterada com sucesso')
      setNewPassword('')
    } catch (err) {
      setPasswordErr(err.message)
    } finally {
      setPasswordLoading(false)
    }
  }

  return (
    <>
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
          <CustomTextField
            select
            fullWidth
            label='Cargo do Sistema'
            value={role}
            onChange={e => setRole(e.target.value)}
            disabled={!canChangeRole}
          >
            {callerRole === 'superAdmin' && <MenuItem value='subAdmin'>Sub Admin</MenuItem>}
            <MenuItem value='admin'>Admin</MenuItem>
            <MenuItem value='user'>Usuário</MenuItem>
          </CustomTextField>
          {role === 'admin' && (
            <>
              <Divider />
              <Typography variant='subtitle2'>Permissões de Compartilhamento</Typography>

              <Button variant='tonal' onClick={() => setPermissionDrawerOpen(true)}>
                Gerenciar Permissões
              </Button>
            </>
          )}

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
          {canResetPassword && (
            <>
              <Divider />
              <Typography variant='subtitle2'>Redefinir Senha</Typography>
              {passwordErr && <Alert severity='error'>{passwordErr}</Alert>}
              {passwordMsg && <Alert severity='success'>{passwordMsg}</Alert>}
              <CustomTextField
                fullWidth
                type={showPassword ? 'text' : 'password'}
                label='Nova Senha'
                placeholder='Mínimo 6 caracteres'
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position='end'>
                      <IconButton onClick={() => setShowPassword(!showPassword)} edge='end'>
                        <i className={showPassword ? 'tabler-eye-off' : 'tabler-eye'} />
                      </IconButton>
                    </InputAdornment>
                  )
                }}
              />
              <Button
                variant='tonal'
                color='warning'
                onClick={handleResetPassword}
                disabled={passwordLoading || !newPassword}
              >
                {passwordLoading ? 'Alterando...' : 'Alterar Senha'}
              </Button>
            </>
          )}
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
      <AdminPermissionDrawer
        open={permissionDrawerOpen}
        handleClose={() => setPermissionDrawerOpen(false)}
        user={user}
        onSave={result => {
          if (result.error) {
            setSnackbar({
              open: true,
              severity: 'error',
              message: result.message
            })

            return
          }

          setSnackbar({
            open: true,
            severity: 'success',
            message: 'Permissões atualizadas com sucesso!'
          })
        }}
      />
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() =>
          setSnackbar(prev => ({
            ...prev,
            open: false
          }))
        }
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right'
        }}
      >
        <Alert
          severity={snackbar.severity}
          variant='filled'
          onClose={() =>
            setSnackbar(prev => ({
              ...prev,
              open: false
            }))
          }
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  )
}

export default EditUserDrawer
