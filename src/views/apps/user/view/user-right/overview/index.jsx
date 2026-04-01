// MUI Imports
import Grid from '@mui/material/Grid'

// Component Imports
import ProjectListTable from './ProjectListTable'
import UserActivityTimeLine from './UserActivityTimeline'

const OverViewTab = () => {
  return (
    <Grid container spacing={6}>
      <Grid size={{ xs: 12 }}>
        <ProjectListTable />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <UserActivityTimeLine />
      </Grid>
    </Grid>
  )
}

export default OverViewTab
