'use client'

import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import DialogContentText from '@mui/material/DialogContentText'
import Button from '@mui/material/Button'

const ConfirmationDialog = ({ open, setOpen, type }) => {
  const handleClose = () => setOpen(false)

  const title = type === 'unsubscribe' ? 'Unsubscribe' : 'Confirm'

  const description =
    type === 'unsubscribe'
      ? 'Are you sure you would like to cancel your subscription?'
      : type === 'suspend-account'
        ? 'Are you sure you would like to suspend this account?'
        : 'Are you sure you want to perform this action?'

  return (
    <Dialog open={open} onClose={handleClose} maxWidth='xs' fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{description}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color='secondary'>
          Cancel
        </Button>
        <Button onClick={handleClose} variant='contained' color='error'>
          Confirm
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default ConfirmationDialog
