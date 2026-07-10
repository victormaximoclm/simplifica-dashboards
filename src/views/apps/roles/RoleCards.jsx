'use client'

import { useState, useEffect, useCallback } from 'react'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'

const RoleCards = ({ workspaceId }) => {
  const [customRoles, setCustomRoles] = useState([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRole, setEditingRole] = useState(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingRole, setDeletingRole] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [formData, setFormData] = useState({ name: '' })

  const fetchRoles = useCallback(async () => {
    if (!workspaceId) return

    const res = await fetch(`/api/apps/custom-roles?workspaceId=${workspaceId}`)

    if (res.ok) {
      setCustomRoles(await res.json())
    }
  }, [workspaceId])

  useEffect(() => {
    fetchRoles()
  }, [fetchRoles])

  const handleOpenCreate = () => {
    setEditingRole(null)
    setFormData({ name: '' })
    setError('')
    setDialogOpen(true)
  }

  const handleOpenEdit = role => {
    setEditingRole(role)
    setFormData({ name: role.name })
    setError('')
    setDialogOpen(true)
  }

  const handleSubmit = async () => {
    setError('')

    if (!formData.name.trim()) {
      setError('Nome do cargo é obrigatório')

      return
    }

    const url = editingRole ? `/api/apps/custom-roles/${editingRole.id}` : '/api/apps/custom-roles'
    const method = editingRole ? 'PUT' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...formData,
        workspaceId
      })
    })

    if (res.ok) {
      setDialogOpen(false)
      setSuccess(editingRole ? 'Cargo atualizado!' : 'Cargo criado!')
      await fetchRoles()
      setTimeout(() => setSuccess(''), 3000)
    } else {
      const data = await res.json()

      setError(data.message || 'Erro ao salvar')
    }
  }

  const handleDelete = async () => {
    const res = await fetch(`/api/apps/custom-roles/${deletingRole.id}`, { method: 'DELETE' })

    if (res.ok) {
      setDeleteDialogOpen(false)
      setDeletingRole(null)
      setSuccess('Cargo excluído!')
      fetchRoles()
      setTimeout(() => setSuccess(''), 3000)
    } else {
      const data = await res.json()

      setDeleteDialogOpen(false)
      setError(data.message || 'Erro ao excluir')
      setTimeout(() => setError(''), 5000)
    }
  }

  return (
    <>
      {success && (
        <Alert severity='success' sx={{ mb: 3 }}>
          {success}
        </Alert>
      )}
      {error && (
        <Alert severity='error' sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={6}>
        {/* System roles - fixed */}
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card sx={{ borderLeft: '4px solid var(--mui-palette-error-main)', height: '100%' }}>
            <CardContent className='flex flex-col gap-4'>
              <div className='flex items-center justify-between'>
                <Chip label='Cargo do Sistema' size='small' color='error' variant='tonal' />
                <i className='tabler-lock text-xl text-textSecondary' />
              </div>
              <div>
                <Typography variant='h5'>Super Admin</Typography>
                <Typography variant='body2' color='text.secondary'>
                  Acesso total a todos os espaços de trabalho e funcionalidades. Cargo imutável.
                </Typography>
              </div>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card sx={{ borderLeft: '4px solid var(--mui-palette-warning-main)', height: '100%' }}>
            <CardContent className='flex flex-col gap-4'>
              <div className='flex items-center justify-between'>
                <Chip label='Cargo do Sistema' size='small' color='warning' variant='tonal' />
                <i className='tabler-lock text-xl text-textSecondary' />
              </div>
              <div>
                <Typography variant='h5'>Sub Admin</Typography>
                <Typography variant='body2' color='text.secondary'>
                  Gerencia espaços de trabalho, usuários e dashboards. Acesso similar ao Super Admin, sem poder
                  removê-lo.
                </Typography>
              </div>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card sx={{ borderLeft: '4px solid var(--mui-palette-primary-main)', height: '100%' }}>
            <CardContent className='flex flex-col gap-4'>
              <div className='flex items-center justify-between'>
                <Chip label='Cargo do Sistema' size='small' color='primary' variant='tonal' />
                <i className='tabler-lock text-xl text-textSecondary' />
              </div>
              <div>
                <Typography variant='h5'>Admin</Typography>
                <Typography variant='body2' color='text.secondary'>
                  Vê todos os dashboards do seu espaço de trabalho. Não pode editar configurações.
                </Typography>
              </div>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Custom Roles Table */}
      <Card sx={{ mt: 6 }}>
        <CardContent>
          <div className='flex items-center justify-between mbe-4'>
            <Typography variant='h5'>Funções Personalizadas</Typography>
            <Button
              variant='contained'
              size='small'
              startIcon={<i className='tabler-plus' />}
              onClick={handleOpenCreate}
            >
              Nova Função
            </Button>
          </div>
          <Typography variant='body2' color='text.secondary' sx={{ mb: 3 }}>
            Funções disponíveis que podem ser atribuídas a usuários para controlar a visibilidade dos módulos.
          </Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Nome</TableCell>
                  <TableCell align='center'>Usuários</TableCell>
                  <TableCell align='center'>Dashboards</TableCell>
                  <TableCell align='center'>Formulários</TableCell>
                  <TableCell align='right'>Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {customRoles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} align='center'>
                      <Typography variant='body2' color='text.secondary' sx={{ py: 4 }}>
                        Nenhuma função personalizada criada ainda.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  customRoles.map(role => (
                    <TableRow key={role.id} hover>
                      <TableCell>
                        <Typography fontWeight={500}>{role.name}</Typography>
                      </TableCell>
                      <TableCell align='center'>
                        <Chip label={role._count?.users || 0} size='small' variant='tonal' color='primary' />
                      </TableCell>
                      <TableCell align='center'>
                        <Chip label={role.moduleCounts?.dashboards || 0} size='small' variant='tonal' color='info' />
                      </TableCell>
                      <TableCell align='center'>
                        <Chip label={role.moduleCounts?.forms || 0} size='small' variant='tonal' color='secondary' />
                      </TableCell>
                      <TableCell align='right'>
                        <IconButton size='small' onClick={() => handleOpenEdit(role)}>
                          <i className='tabler-edit text-textSecondary' />
                        </IconButton>
                        <IconButton
                          size='small'
                          onClick={() => {
                            setDeletingRole(role)
                            setDeleteDialogOpen(true)
                          }}
                        >
                          <i className='tabler-trash text-textSecondary' />
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

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth='sm' fullWidth>
        <DialogTitle>{editingRole ? 'Editar Função' : 'Nova Função'}</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity='error' sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Box display='flex' flexDirection='column' gap={3} mt={1}>
            <TextField
              label='Nome da Função'
              value={formData.name}
              onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder='Ex: Recepção, Faturamento, Enfermagem...'
              fullWidth
              autoFocus
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button variant='contained' onClick={handleSubmit}>
            {editingRole ? 'Salvar' : 'Criar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Excluir Função</DialogTitle>
        <DialogContent>
          <Typography>
            Tem certeza que deseja excluir a função <strong>{deletingRole?.name}</strong>?
          </Typography>
          <Typography variant='body2' color='text.secondary' sx={{ mt: 1 }}>
            Funções com usuários vinculados não podem ser excluídas.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
          <Button variant='contained' color='error' onClick={handleDelete}>
            Excluir
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

export default RoleCards
