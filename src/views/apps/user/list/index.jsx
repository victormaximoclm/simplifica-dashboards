'use client'

// Next Imports
import dynamic from 'next/dynamic'

// MUI Imports
import Grid from '@mui/material/Grid'

// Component Imports
import UserListCards from './UserListCards'

const UserListTable = dynamic(() => import('./UserListTable'), { ssr: false })

const UserList = ({ userData, workspaces, stats, userUsage }) => {
  return (
    <Grid container spacing={6}>
      <Grid size={{ xs: 12 }}>
        <UserListCards stats={stats} />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <UserListTable tableData={userData} workspaces={workspaces} userUsage={userUsage} />
      </Grid>
    </Grid>
  )
}

export default UserList
