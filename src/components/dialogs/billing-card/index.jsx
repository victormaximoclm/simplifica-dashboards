'use client'

import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Grid from '@mui/material/Grid'

const BillingCard = ({ open, setOpen }) => {
  const handleClose = () => setOpen(false)

  return (
    <Dialog open={open} onClose={handleClose} maxWidth='sm' fullWidth>
      <DialogTitle>Add New Card</DialogTitle>
      <DialogContent>
        <Grid container spacing={4} className='pbs-4'>
          <Grid size={{ xs: 12 }}>
            <TextField fullWidth label='Card Number' placeholder='0000 0000 0000 0000' />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TextField fullWidth label='Name on Card' placeholder='John Doe' />
          </Grid>
          <Grid size={{ xs: 3 }}>
            <TextField fullWidth label='Expiry' placeholder='MM/YY' />
          </Grid>
          <Grid size={{ xs: 3 }}>
            <TextField fullWidth label='CVV' placeholder='123' />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color='secondary'>
          Cancel
        </Button>
        <Button onClick={handleClose} variant='contained'>
          Submit
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default BillingCard
