'use client'

import { useState } from 'react'

import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import FormControlLabel from '@mui/material/FormControlLabel'
import Checkbox from '@mui/material/Checkbox'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'

const RoleDialog = ({ open, setOpen, title }) => {
  const handleClose = () => setOpen(false)

  return (
    <Dialog open={open} onClose={handleClose} maxWidth='sm' fullWidth>
      <DialogTitle>{title || 'Add New Role'}</DialogTitle>
      <DialogContent>
        <Typography className='mbe-4'>Set role permissions</Typography>
        <TextField fullWidth label='Role Name' placeholder='Enter Role Name' className='mbe-4' />
        <Typography variant='h6' className='mbe-2'>
          Role Permissions
        </Typography>
        <Grid container spacing={2}>
          {['User Management', 'Content Management', 'Database Management', 'Financial Management'].map(perm => (
            <Grid size={{ xs: 12 }} key={perm}>
              <FormControlLabel control={<Checkbox />} label={perm} />
            </Grid>
          ))}
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

export default RoleDialog
