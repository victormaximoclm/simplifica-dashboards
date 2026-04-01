// React Imports
import { useState, useEffect } from 'react'

// MUI Imports
import CardContent from '@mui/material/CardContent'
import Grid from '@mui/material/Grid'
import MenuItem from '@mui/material/MenuItem'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

const TableFilters = ({ setData, tableData, workspaces }) => {
  // States
  const [role, setRole] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    const filteredData = tableData?.filter(user => {
      if (role && user.role !== role) return false
      if (workspaceId && user.workspace?.id !== workspaceId) return false
      if (status && user.status !== status) return false

      return true
    })

    setData(filteredData || [])
  }, [role, workspaceId, status, tableData, setData])

  return (
    <CardContent>
      <Grid container spacing={6}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <CustomTextField
            select
            fullWidth
            id='select-role'
            value={role}
            onChange={e => setRole(e.target.value)}
            slotProps={{
              select: { displayEmpty: true }
            }}
          >
            <MenuItem value=''>Selecione o Cargo</MenuItem>
            <MenuItem value='superAdmin'>Super Admin</MenuItem>
            <MenuItem value='subAdmin'>Sub Admin</MenuItem>
            <MenuItem value='admin'>Admin</MenuItem>
            <MenuItem value='user'>Usuário</MenuItem>
          </CustomTextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <CustomTextField
            select
            fullWidth
            id='select-workspace'
            value={workspaceId}
            onChange={e => setWorkspaceId(e.target.value)}
            slotProps={{
              select: { displayEmpty: true }
            }}
          >
            <MenuItem value=''>Selecione a Empresa</MenuItem>
            {(workspaces || []).map(ws => (
              <MenuItem key={ws.id} value={ws.id}>
                {ws.name}
              </MenuItem>
            ))}
          </CustomTextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <CustomTextField
            select
            fullWidth
            id='select-status'
            value={status}
            onChange={e => setStatus(e.target.value)}
            slotProps={{
              select: { displayEmpty: true }
            }}
          >
            <MenuItem value=''>Selecione o Status</MenuItem>
            <MenuItem value='active'>Ativo</MenuItem>
            <MenuItem value='pending'>Pendente</MenuItem>
            <MenuItem value='inactive'>Inativo</MenuItem>
          </CustomTextField>
        </Grid>
      </Grid>
    </CardContent>
  )
}

export default TableFilters
