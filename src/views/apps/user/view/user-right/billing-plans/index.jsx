// MUI Imports
import Grid from '@mui/material/Grid'

// Component Imports
import CurrentPlan from './CurrentPlan'
import PaymentMethod from './PaymentMethod'
import BillingAddress from './BillingAddress'

const BillingPlans = () => {
  return (
    <Grid container spacing={6}>
      <Grid size={{ xs: 12 }}>
        <CurrentPlan />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <PaymentMethod />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <BillingAddress />
      </Grid>
    </Grid>
  )
}

export default BillingPlans
