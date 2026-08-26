'use client'

import { useState } from 'react'

import Grid from '@mui/material/Grid'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import DialogContentText from '@mui/material/DialogContentText'
import TextField from '@mui/material/TextField'
import Chip from '@mui/material/Chip'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Divider from '@mui/material/Divider'
import Switch from '@mui/material/Switch'
import FormControlLabel from '@mui/material/FormControlLabel'
import Autocomplete from '@mui/material/Autocomplete'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'

import { CLICKUP_WORKSPACE_CONFIG_DEFAULTS } from '@/app/constants/integration'

const CLICKUP_EMPTY = { ...CLICKUP_WORKSPACE_CONFIG_DEFAULTS }

const GUEST_PERMISSION_OPTIONS = [
  { value: 'view', label: 'Somente visualizar' },
  { value: 'edit', label: 'Visualizar e editar' },
  { value: 'create', label: 'Visualizar, editar e criar' }
]

const WorkspaceList = ({ workspaces: initialWorkspaces }) => {
  const [workspaces, setWorkspaces] = useState(initialWorkspaces)
  const [openDialog, setOpenDialog] = useState(false)
  const [editingWorkspace, setEditingWorkspace] = useState(null)
  const [workspaceName, setWorkspaceName] = useState('')
  const [clickup, setClickup] = useState(CLICKUP_EMPTY)
  const [error, setError] = useState('')
  const [deleteDialog, setDeleteDialog] = useState(false)
  const [workspaceToDelete, setWorkspaceToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  // Controle de acesso privado
  const [isPrivate, setIsPrivate] = useState(false)
  const [allUsers, setAllUsers] = useState([])
  const [guests, setGuests] = useState([]) // [{ id, name, email, permission }]
  const [loadingAccess, setLoadingAccess] = useState(false)

  const handleOpenCreate = () => {
    setEditingWorkspace(null)
    setWorkspaceName('')
    setClickup(CLICKUP_EMPTY)
    setError('')
    setIsPrivate(false)
    setGuests([])
    setOpenDialog(true)
  }

  const handleOpenEdit = async workspace => {
    setEditingWorkspace(workspace)
    setWorkspaceName(workspace.name)
    setClickup(CLICKUP_EMPTY)
    setError('')
    setIsPrivate(false)
    setGuests([])
    setOpenDialog(true)
    setLoadingAccess(true)

    // Busca integração existente
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/workspaces/${workspace.id}/integrations/clickup`)

      if (res.ok) {
        const data = await res.json()

        if (data?.configJson) {
          setClickup({
            workspaceId: data.configJson.workspaceId ?? '',
            listId: data.configJson.listId ?? '',
            cargoId: data.configJson.cargoId ?? '',
            token: data.configJson.token ?? '',
            clientId: data.configJson.clientId ?? '',
            clientSecret: data.configJson.clientSecret ?? ''
          })
        }
      }
    } catch {
      // sem integração ainda, ok
    }

    // Busca dados completos do workspace (isPrivate + convidados) e lista de usuários
    try {
      const [wsRes, usersRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/apps/workspaces/${workspace.id}`),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/apps/users`)
      ])

      if (wsRes.ok) {
        const wsData = await wsRes.json()

        setIsPrivate(wsData.isPrivate ?? false)
        setGuests(
          (wsData.guests ?? []).map(g => ({
            id: g.userId,
            name: g.user?.name,
            email: g.user?.email,
            permission: g.permission ?? 'view'
          }))
        )
      }

      if (usersRes.ok) {
        setAllUsers(await usersRes.json())
      }
    } catch {
      // falha ao carregar controle de acesso, mantém padrão
    } finally {
      setLoadingAccess(false)
    }
  }

  const handleClose = () => {
    setOpenDialog(false)
    setEditingWorkspace(null)
    setWorkspaceName('')
    setClickup(CLICKUP_EMPTY)
    setError('')
    setIsPrivate(false)
    setGuests([])
  }

  const handleGuestsChange = (_, newValue) => {
    setGuests(prev =>
      newValue.map(u => {
        const existing = prev.find(g => g.id === u.id)

        return { id: u.id, name: u.name, email: u.email, permission: existing?.permission ?? 'view' }
      })
    )
  }

  const handleGuestPermissionChange = (userId, permission) => {
    setGuests(prev => prev.map(g => (g.id === userId ? { ...g, permission } : g)))
  }

  const handleClickupChange = field => e => {
    setClickup(prev => ({ ...prev, [field]: e.target.value }))
  }

  const handleSubmit = async () => {
    if (!workspaceName.trim()) {
      setError('Nome é obrigatório')

      return
    }

    try {
      // 1. Salva/atualiza o workspace
      const url = editingWorkspace
        ? `${process.env.NEXT_PUBLIC_API_URL}/apps/workspaces/${editingWorkspace.id}`
        : `${process.env.NEXT_PUBLIC_API_URL}/apps/workspaces`

      const res = await fetch(url, {
        method: editingWorkspace ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: workspaceName.trim(),
          isPrivate,
          guests: guests.map(g => ({ userId: g.id, permission: g.permission }))
        })
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.message || 'Erro ao salvar')

        return
      }

      const workspaceId = data.id

      // 2. Salva integração ClickUp se ao menos um campo foi preenchido
      const hasClickup = clickup.workspaceId || clickup.listId || clickup.cargoId || clickup.clientId || clickup.token

      if (hasClickup) {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/workspaces/${workspaceId}/integrations/clickup`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enabled: true,
            configJson: { ...clickup }
          })
        })
      }

      if (editingWorkspace) {
        setWorkspaces(prev => prev.map(ws => (ws.id === data.id ? { ...ws, ...data } : ws)))
      } else {
        setWorkspaces(prev => [{ ...data, _count: { users: 0 } }, ...prev])
      }

      handleClose()
    } catch {
      setError('Erro de conexão')
    }
  }

  const handleOpenDeleteDialog = workspace => {
    setWorkspaceToDelete(workspace)
    setDeleteDialog(true)
  }

  const handleCloseDeleteDialog = () => {
    setDeleteDialog(false)
    setWorkspaceToDelete(null)
  }

  const handleConfirmDelete = async () => {
    if (!workspaceToDelete) return

    setDeleting(true)

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/apps/workspaces/${workspaceToDelete.id}`, {
        method: 'DELETE'
      })

      if (!res.ok) {
        const data = await res.json()

        alert(data.message || 'Erro ao excluir')
        setDeleting(false)

        return
      }

      setWorkspaces(prev => prev.filter(ws => ws.id !== workspaceToDelete.id))
      handleCloseDeleteDialog()
    } catch {
      alert('Erro de conexão')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Grid container spacing={6}>
      <Grid size={{ xs: 12 }}>
        <Typography
          variant='h4'
          className='mbe-1'
          sx={theme => ({ ...(theme.palette.mode === 'light' && { color: '#2F2B3D' }) })}
        >
          Espaços de Trabalho
        </Typography>
        <Typography sx={theme => ({ ...(theme.palette.mode === 'light' && { color: '#808390' }) })}>
          Gerencie os espaços de trabalho (empresas) cadastrados no sistema.
        </Typography>
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Card>
          <CardHeader
            title='Lista de Espaços de Trabalho'
            action={
              <Button variant='contained' onClick={handleOpenCreate} startIcon={<i className='tabler-plus' />}>
                Novo Espaço
              </Button>
            }
          />
          <CardContent>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Nome</TableCell>
                    <TableCell>Slug</TableCell>
                    <TableCell>Usuários</TableCell>
                    <TableCell>Criado em</TableCell>
                    <TableCell align='right'>Ações</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {workspaces.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align='center'>
                        <Typography color='text.secondary'>Nenhum espaço de trabalho encontrado</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    workspaces.map(ws => (
                      <TableRow key={ws.id}>
                        <TableCell>
                          <Typography fontWeight={500}>{ws.name}</Typography>
                        </TableCell>
                        <TableCell>
                          <Chip label={ws.slug} size='small' variant='tonal' color='primary' />
                        </TableCell>
                        <TableCell>
                          <Chip label={ws._count?.users ?? 0} size='small' variant='tonal' color='secondary' />
                        </TableCell>
                        <TableCell>{new Date(ws.createdAt).toLocaleDateString('pt-BR')}</TableCell>
                        <TableCell align='right'>
                          <IconButton size='small' onClick={() => handleOpenEdit(ws)} title='Editar'>
                            <i className='tabler-edit text-[22px] text-textSecondary' />
                          </IconButton>
                          <IconButton
                            size='small'
                            color='error'
                            onClick={() => handleOpenDeleteDialog(ws)}
                            title='Excluir'
                          >
                            <i className='tabler-trash text-[22px]' />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </Grid>

      {/* Create / Edit Dialog */}
      <Dialog open={openDialog} onClose={handleClose} maxWidth='sm' fullWidth>
        <DialogTitle>{editingWorkspace ? 'Editar Espaço de Trabalho' : 'Novo Espaço de Trabalho'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Nome */}
          <TextField
            autoFocus
            fullWidth
            label='Nome do espaço de trabalho'
            placeholder='Ex: Hospital Potiguar'
            value={workspaceName}
            onChange={e => setWorkspaceName(e.target.value)}
            error={!!error}
            helperText={error}
            className='mbs-4'
          />

          <FormControlLabel
            control={<Switch checked={isPrivate} onChange={e => setIsPrivate(e.target.checked)} />}
            label='Workspace privado (acesso restrito por usuário)'
          />
          {isPrivate && (
            <>
              <Autocomplete
                multiple
                loading={loadingAccess}
                options={allUsers}
                getOptionLabel={u => `${u.name ?? 'Sem nome'} (${u.email ?? '—'})`}
                value={guests}
                onChange={handleGuestsChange}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                renderInput={params => (
                  <TextField {...params} label='Usuários convidados' placeholder='Selecione os usuários' />
                )}
              />
              {guests.length > 0 && (
                <List dense disablePadding>
                  {guests.map(guest => (
                    <ListItem
                      key={guest.id}
                      disableGutters
                      secondaryAction={
                        <FormControl size='small' sx={{ minWidth: 220 }}>
                          <InputLabel id={`guest-permission-${guest.id}`}>Permissão</InputLabel>
                          <Select
                            labelId={`guest-permission-${guest.id}`}
                            label='Permissão'
                            value={guest.permission}
                            onChange={e => handleGuestPermissionChange(guest.id, e.target.value)}
                          >
                            {GUEST_PERMISSION_OPTIONS.map(opt => (
                              <MenuItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      }
                    >
                      <ListItemText primary={guest.name ?? 'Sem nome'} secondary={guest.email ?? '—'} />
                    </ListItem>
                  ))}
                </List>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} color='secondary'>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} variant='contained'>
            {editingWorkspace ? 'Salvar' : 'Criar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog} onClose={handleCloseDeleteDialog} maxWidth='sm' fullWidth>
        <DialogTitle sx={{ color: 'error.main', display: 'flex', alignItems: 'center', gap: 2 }}>
          <i className='tabler-alert-triangle' style={{ fontSize: '1.5rem' }} />
          Excluir Espaço de Trabalho
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Você está prestes a excluir o espaço de trabalho <strong>&quot;{workspaceToDelete?.name}&quot;</strong>.
          </DialogContentText>
          <DialogContentText sx={{ mb: 2, color: 'error.main', fontWeight: 500 }}>
            Esta ação é irreversível e irá remover permanentemente:
          </DialogContentText>
          <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
            <li>
              <DialogContentText>
                <strong>{workspaceToDelete?._count?.users ?? 0}</strong> usuário(s) vinculado(s) e todos os seus dados
              </DialogContentText>
            </li>
            <li>
              <DialogContentText>Todos os dashboards e configurações de visibilidade</DialogContentText>
            </li>
            <li>
              <DialogContentText>Todas as notificações relacionadas</DialogContentText>
            </li>
          </ul>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteDialog} color='secondary' disabled={deleting}>
            Cancelar
          </Button>
          <Button onClick={handleConfirmDelete} variant='contained' color='error' disabled={deleting}>
            {deleting ? 'Excluindo...' : 'Excluir Permanentemente'}
          </Button>
        </DialogActions>
      </Dialog>
    </Grid>
  )
}

export default WorkspaceList
