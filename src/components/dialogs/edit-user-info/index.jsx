'use client'

import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Grid from '@mui/material/Grid'

const EditUserInfo = ({ open, setOpen }) => {
  const handleClose = () => setOpen(false)

  return (
    <Dialog open={open} onClose={handleClose} maxWidth='sm' fullWidth>
      <DialogTitle>Edit User Info</DialogTitle>
      <DialogContent>
        <Grid container spacing={4} className='pbs-4'>
          <Grid size={{ xs: 6 }}>
            <TextField fullWidth label='First Name' placeholder='John' />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TextField fullWidth label='Last Name' placeholder='Doe' />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField fullWidth label='Email' placeholder='john@example.com' />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TextField fullWidth label='Status' placeholder='Active' />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TextField fullWidth label='Role' placeholder='Admin' />
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

export default EditUserInfo
