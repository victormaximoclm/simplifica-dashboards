'use client'

import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import FormControlLabel from '@mui/material/FormControlLabel'
import Checkbox from '@mui/material/Checkbox'

const PermissionDialog = ({ open, setOpen, data }) => {
  const handleClose = () => setOpen(false)

  return (
    <Dialog open={open} onClose={handleClose} maxWidth='xs' fullWidth>
      <DialogTitle>{data ? 'Edit Permission' : 'Add New Permission'}</DialogTitle>
      <DialogContent className='flex flex-col gap-4 pbs-4'>
        <TextField fullWidth label='Permission Name' defaultValue={data || ''} placeholder='Enter Permission Name' />
        <FormControlLabel control={<Checkbox defaultChecked />} label='Set as core permission' />
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

export default PermissionDialog
