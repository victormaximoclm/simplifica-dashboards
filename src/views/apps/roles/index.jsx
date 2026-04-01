'use client'

// MUI Imports
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'

// Component Imports
import RoleCards from './RoleCards'

const Roles = () => {
  return (
    <Grid container spacing={6}>
      <Grid size={{ xs: 12 }}>
        <Typography
          variant='h4'
          className='mbe-1'
          sx={theme => ({ ...(theme.palette.mode === 'light' && { color: '#2F2B3D' }) })}
        >
          Cargos
        </Typography>
        <Typography sx={theme => ({ ...(theme.palette.mode === 'light' && { color: '#808390' }) })}>
          Gerencie os cargos do sistema. Super Admin e Admin são cargos fixos. Cargos personalizados são globais e
          controlam a visibilidade dos dashboards.
        </Typography>
      </Grid>
      <Grid size={{ xs: 12 }}>
        <RoleCards />
      </Grid>
    </Grid>
  )
}

export default Roles
