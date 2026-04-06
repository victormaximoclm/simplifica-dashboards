'use client'

import { useState, useEffect, useCallback } from 'react'

import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import OutlinedInput from '@mui/material/OutlinedInput'
import Checkbox from '@mui/material/Checkbox'
import ListItemText from '@mui/material/ListItemText'

const DashboardManage = ({ workspaces }) => {
  const [dashboards, setDashboards] = useState([])
  const [customRoles, setCustomRoles] = useState([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editingDashboard, setEditingDashboard] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [formData, setFormData] = useState({
    iframeCode: '',
    title: '',
    workspaceId: '',
    allowedRoleIds: []
  })

  const fetchDashboards = useCallback(async () => {
    const res = await fetch('/api/apps/dashboards', { cache: 'no-store' })

    if (res.ok) {
      setDashboards(await res.json())
    }
  }, [])

  const notifyDashboardsChanged = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('dashboards-changed'))
    }
  }

  const fetchCustomRoles = useCallback(async () => {
    const res = await fetch('/api/apps/custom-roles')

    if (res.ok) {
      setCustomRoles(await res.json())
    }
  }, [])

  useEffect(() => {
    fetchDashboards()
    fetchCustomRoles()
  }, [fetchDashboards, fetchCustomRoles])

  // Custom roles are global (not workspace-scoped)
  const filteredRoles = customRoles

  const resetForm = () => {
    setFormData({ iframeCode: '', title: '', workspaceId: '', allowedRoleIds: [] })
    setEditingDashboard(null)
    setError('')
  }

  const handleOpenCreate = () => {
    resetForm()
    setDialogOpen(true)
  }

  const handleOpenEdit = dashboard => {
    setEditingDashboard(dashboard)

    setFormData({
      iframeCode: '',
      title: dashboard.title,
      workspaceId: dashboard.workspaceId,
      allowedRoleIds: (dashboard.allowedRoles || []).map(ar => ar.customRoleId)
    })

    setDialogOpen(true)
  }

  const handleSubmit = async () => {
    setError('')

    if (!editingDashboard && !formData.iframeCode.trim()) {
      setError('Cole o código iframe do Power BI')

      return
    }

    if (!formData.workspaceId) {
      setError('Selecione um workspace')

      return
    }

    const url = editingDashboard ? `/api/apps/dashboards/${editingDashboard.id}` : '/api/apps/dashboards'
    const method = editingDashboard ? 'PUT' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...formData,
        iframeCode: formData.iframeCode.trim() || undefined
      })
    })

    if (res.ok) {
      setDialogOpen(false)
      setSuccess(editingDashboard ? 'Dashboard atualizado!' : 'Dashboard criado!')
      resetForm()
      await fetchDashboards()
      notifyDashboardsChanged()
      setTimeout(() => setSuccess(''), 3000)
    } else {
      const data = await res.json()

      setError(data.message || 'Erro ao salvar')
    }
  }

  const handleDelete = async () => {
    const res = await fetch(`/api/apps/dashboards/${deletingId}`, { method: 'DELETE' })

    if (res.ok) {
      setDeleteDialogOpen(false)
      setDeletingId(null)
      setSuccess('Dashboard excluído!')
      await fetchDashboards()
      notifyDashboardsChanged()
      setTimeout(() => setSuccess(''), 3000)
    }
  }

  return (
    <Card>
      <CardHeader
        title='Gerenciar Dashboards'
        action={
          <Button variant='contained' startIcon={<i className='tabler-plus' />} onClick={handleOpenCreate}>
            Novo Dashboard
          </Button>
        }
      />
      <CardContent>
        {success && (
          <Alert severity='success' sx={{ mb: 3 }}>
            {success}
          </Alert>
        )}

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Título</TableCell>
                <TableCell>Workspace</TableCell>
                <TableCell>Cargos com acesso</TableCell>
                <TableCell>Criado em</TableCell>
                <TableCell align='right'>Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {dashboards.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align='center'>
                    <Typography color='text.secondary'>Nenhum dashboard cadastrado</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                dashboards.map(db => (
                  <TableRow key={db.id}>
                    <TableCell>
                      <Typography fontWeight={500}>{db.title}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={db.workspace?.name} size='small' sx={{ bgcolor: '#EB8A5F', color: '#FFF' }} />
                    </TableCell>
                    <TableCell>
                      <div className='flex flex-wrap gap-1'>
                        {(db.allowedRoles || []).length === 0 ? (
                          <Chip label='Somente Admin' size='small' variant='tonal' color='warning' />
                        ) : (
                          (db.allowedRoles || []).map(ar => (
                            <Chip
                              key={ar.customRoleId}
                              label={ar.customRole?.name || ar.customRoleId}
                              size='small'
                              variant='tonal'
                              color='info'
                            />
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{new Date(db.createdAt).toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell align='right'>
                      <IconButton size='small' onClick={() => handleOpenEdit(db)}>
                        <i className='tabler-edit text-[22px] text-textSecondary' />
                      </IconButton>
                      <IconButton
                        size='small'
                        onClick={() => {
                          setDeletingId(db.id)
                          setDeleteDialogOpen(true)
                        }}
                      >
                        <i className='tabler-trash text-[22px] text-textSecondary' />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth='md' fullWidth>
        <DialogTitle>{editingDashboard ? 'Editar Dashboard' : 'Novo Dashboard'}</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity='error' sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Box display='flex' flexDirection='column' gap={3} mt={1}>
            <TextField
              label='Título (opcional - será extraído do iframe)'
              value={formData.title}
              onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
              fullWidth
            />
            <TextField
              label='Código iframe do Power BI'
              value={formData.iframeCode}
              onChange={e => setFormData(prev => ({ ...prev, iframeCode: e.target.value }))}
              placeholder='<iframe title="..." src="https://app.powerbi.com/view?r=..." ...></iframe>'
              multiline
              rows={4}
              fullWidth
              helperText='Cole o código iframe gerado pelo Power BI'
            />
            {editingDashboard && (
              <Alert severity='info' variant='outlined'>
                Só preencha o iframe se quiser trocar a origem do dashboard.
              </Alert>
            )}
            <TextField
              select
              label='Workspace'
              value={formData.workspaceId}
              onChange={e =>
                setFormData(prev => ({
                  ...prev,
                  workspaceId: e.target.value,
                  allowedRoleIds: []
                }))
              }
              fullWidth
            >
              {workspaces.map(ws => (
                <MenuItem key={ws.id} value={ws.id}>
                  {ws.name}
                </MenuItem>
              ))}
            </TextField>
            <FormControl fullWidth>
              <InputLabel>Cargos que podem visualizar</InputLabel>
              <Select
                multiple
                value={formData.allowedRoleIds}
                onChange={e => setFormData(prev => ({ ...prev, allowedRoleIds: e.target.value }))}
                input={<OutlinedInput label='Cargos que podem visualizar' />}
                renderValue={selected => (
                  <div className='flex flex-wrap gap-1'>
                    {selected.map(id => {
                      const role = customRoles.find(r => r.id === id)

                      return <Chip key={id} label={role?.name || id} size='small' />
                    })}
                  </div>
                )}
              >
                {filteredRoles.length === 0 ? (
                  <MenuItem disabled>
                    {formData.workspaceId
                      ? 'Nenhum cargo neste workspace. Crie cargos primeiro.'
                      : 'Selecione um workspace primeiro'}
                  </MenuItem>
                ) : (
                  filteredRoles.map(role => (
                    <MenuItem key={role.id} value={role.id}>
                      <Checkbox checked={formData.allowedRoleIds.includes(role.id)} />
                      <ListItemText primary={role.name} />
                    </MenuItem>
                  ))
                )}
              </Select>
            </FormControl>
            <Alert severity='info' variant='outlined'>
              <Typography variant='body2'>
                <strong>Super Admin</strong> e <strong>Admin</strong> sempre veem todos os dashboards.
                {formData.allowedRoleIds.length === 0 && (
                  <>
                    <br />
                    Sem cargos selecionados = somente Admin e Super Admin terão acesso.
                  </>
                )}
              </Typography>
            </Alert>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button variant='contained' onClick={handleSubmit}>
            {editingDashboard ? 'Salvar' : 'Criar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Excluir Dashboard</DialogTitle>
        <DialogContent>
          <Typography>Tem certeza que deseja excluir este dashboard? Esta ação não pode ser desfeita.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
          <Button variant='contained' color='error' onClick={handleDelete}>
            Excluir
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  )
}

export default DashboardManage
