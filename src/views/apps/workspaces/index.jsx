'use client'

// React Imports
import { useState } from 'react'

// MUI Imports
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

const WorkspaceList = ({ workspaces: initialWorkspaces }) => {
  const [workspaces, setWorkspaces] = useState(initialWorkspaces)
  const [openDialog, setOpenDialog] = useState(false)
  const [editingWorkspace, setEditingWorkspace] = useState(null)
  const [workspaceName, setWorkspaceName] = useState('')
  const [error, setError] = useState('')
  const [deleteDialog, setDeleteDialog] = useState(false)
  const [workspaceToDelete, setWorkspaceToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const handleOpenCreate = () => {
    setEditingWorkspace(null)
    setWorkspaceName('')
    setError('')
    setOpenDialog(true)
  }

  const handleOpenEdit = workspace => {
    setEditingWorkspace(workspace)
    setWorkspaceName(workspace.name)
    setError('')
    setOpenDialog(true)
  }

  const handleClose = () => {
    setOpenDialog(false)
    setEditingWorkspace(null)
    setWorkspaceName('')
    setError('')
  }

  const handleSubmit = async () => {
    if (!workspaceName.trim()) {
      setError('Nome é obrigatório')

      return
    }

    try {
      const url = editingWorkspace
        ? `${process.env.NEXT_PUBLIC_API_URL}/apps/workspaces/${editingWorkspace.id}`
        : `${process.env.NEXT_PUBLIC_API_URL}/apps/workspaces`

      const res = await fetch(url, {
        method: editingWorkspace ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: workspaceName.trim() })
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.message || 'Erro ao salvar')

        return
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
        <DialogContent>
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
