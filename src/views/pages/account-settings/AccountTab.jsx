'use client'

// React Imports
import { useState, useRef } from 'react'

// MUI Imports
import Grid from '@mui/material/Grid'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Avatar from '@mui/material/Avatar'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogActions from '@mui/material/DialogActions'
import Alert from '@mui/material/Alert'

// Third-party Imports
import { signOut, useSession } from 'next-auth/react'
import { toast } from 'react-toastify'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

const AccountTab = ({ userData }) => {
  // States
  const [name, setName] = useState(userData?.name || '')
  const [imagePreview, setImagePreview] = useState(userData?.image || '')
  const [imageFile, setImageFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Refs
  const fileInputRef = useRef(null)

  // Hooks
  const { data: session, update: updateSession } = useSession()

  const handleImageChange = e => {
    const file = e.target.files?.[0]

    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error('A imagem deve ter no máximo 2MB')

        return
      }

      setImageFile(file)

      const reader = new FileReader()

      reader.onloadend = () => {
        setImagePreview(reader.result)
      }

      reader.readAsDataURL(file)
    }
  }

  const handleResetImage = () => {
    setImagePreview(userData?.image || '')
    setImageFile(null)

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSave = async () => {
    setSaving(true)

    try {
      const payload = { name }

      // If a new image was selected, include the base64 data
      if (imageFile) {
        payload.image = imagePreview
      }

      const res = await fetch('/api/apps/account-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const data = await res.json()

        throw new Error(data.message || 'Erro ao salvar')
      }

      // Update the session with new name/image
      await updateSession({
        ...session,
        user: {
          ...session.user,
          name,
          image: imagePreview
        }
      })

      toast.success('Perfil atualizado com sucesso')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteAccount = async () => {
    setDeleting(true)

    try {
      const res = await fetch('/api/apps/account-settings', {
        method: 'DELETE'
      })

      if (!res.ok) {
        const data = await res.json()

        throw new Error(data.message || 'Erro ao deletar conta')
      }

      toast.success('Conta deletada com sucesso')
      await signOut({ callbackUrl: '/' })
    } catch (error) {
      toast.error(error.message)
    } finally {
      setDeleting(false)
      setDeleteDialogOpen(false)
    }
  }

  return (
    <Grid container spacing={6}>
      {/* Profile Card */}
      <Grid item xs={12}>
        <Card>
          <CardContent className='flex flex-col gap-6'>
            <div className='flex items-center gap-6'>
              <Avatar src={imagePreview} alt={name} sx={{ width: 100, height: 100, fontSize: '2rem' }}>
                {name?.charAt(0)?.toUpperCase()}
              </Avatar>
              <div className='flex flex-col gap-4'>
                <div className='flex gap-4'>
                  <Button component='label' variant='contained' size='small'>
                    Enviar foto
                    <input
                      ref={fileInputRef}
                      hidden
                      type='file'
                      accept='image/png, image/jpeg, image/webp'
                      onChange={handleImageChange}
                    />
                  </Button>
                  <Button variant='tonal' color='secondary' size='small' onClick={handleResetImage}>
                    Resetar
                  </Button>
                </div>
                <Typography variant='body2' color='text.disabled'>
                  PNG, JPG ou WEBP. Máximo 2MB.
                </Typography>
              </div>
            </div>
            <Divider />
            <Grid container spacing={6}>
              <Grid item xs={12} sm={6}>
                <CustomTextField fullWidth label='Nome' value={name} onChange={e => setName(e.target.value)} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <CustomTextField fullWidth label='Email' value={userData?.email || ''} disabled />
              </Grid>
              <Grid item xs={12} sm={6}>
                <CustomTextField fullWidth label='Role' value={userData?.role || ''} disabled />
              </Grid>
              <Grid item xs={12} sm={6}>
                <CustomTextField fullWidth label='Workspace' value={userData?.workspace?.name || 'N/A'} disabled />
              </Grid>
            </Grid>
            <div className='flex gap-4'>
              <Button variant='contained' onClick={handleSave} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar alterações'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </Grid>

      {/* Delete Account Card */}
      {session?.user?.role !== 'superAdmin' && (
        <Grid item xs={12}>
          <Card>
            <CardContent className='flex flex-col gap-4'>
              <Typography variant='h6' color='error'>
                Deletar conta
              </Typography>
              <Alert severity='warning' icon={false}>
                <Typography variant='body2'>
                  Tem certeza que deseja deletar sua conta? Esta ação é irreversível. Todos os seus dados serão
                  permanentemente removidos.
                </Typography>
              </Alert>
              <div>
                <Button variant='contained' color='error' onClick={() => setDeleteDialogOpen(true)}>
                  Deletar minha conta
                </Button>
              </div>
            </CardContent>
          </Card>
        </Grid>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Confirmar exclusão de conta</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Você está prestes a deletar sua conta permanentemente. Esta ação não pode ser desfeita. Deseja continuar?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} color='secondary'>
            Cancelar
          </Button>
          <Button onClick={handleDeleteAccount} color='error' variant='contained' disabled={deleting}>
            {deleting ? 'Deletando...' : 'Sim, deletar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Grid>
  )
}

export default AccountTab
