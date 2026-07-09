'use client'

import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'
import RoleCards from './RoleCards'

const Roles = ({ workspaceId }) => {
  return (
    <Grid container spacing={6}>
      <Grid size={{ xs: 12 }}>
        <Typography
          variant='h4'
          className='mbe-1'
          sx={theme => ({ ...(theme.palette.mode === 'light' && { color: '#2F2B3D' }) })}
        >
          Funções
        </Typography>
        <Typography sx={theme => ({ ...(theme.palette.mode === 'light' && { color: '#808390' }) })}>
          Gerencie as funções do sistema. Super Admin e Admin são funções fixas. Funções personalizadas são globais e
          controlam a visibilidade dos dashboards.
        </Typography>
      </Grid>
      <Grid size={{ xs: 12 }}>
        <RoleCards workspaceId={workspaceId} />
      </Grid>
    </Grid>
  )
}

export default Roles
