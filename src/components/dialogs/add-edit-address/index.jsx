'use client'

import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Grid from '@mui/material/Grid'

const AddEditAddress = ({ open, setOpen }) => {
  const handleClose = () => setOpen(false)

  return (
    <Dialog open={open} onClose={handleClose} maxWidth='sm' fullWidth>
      <DialogTitle>Add New Address</DialogTitle>
      <DialogContent>
        <Grid container spacing={4} className='pbs-4'>
          <Grid size={{ xs: 12 }}>
            <TextField fullWidth label='Address Line 1' placeholder='123 Main St' />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField fullWidth label='Address Line 2' placeholder='Apt 4B' />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TextField fullWidth label='City' placeholder='New York' />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TextField fullWidth label='State' placeholder='NY' />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TextField fullWidth label='Zip Code' placeholder='10001' />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TextField fullWidth label='Country' placeholder='US' />
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

export default AddEditAddress
