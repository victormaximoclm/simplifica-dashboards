'use client'

import { useState, useEffect } from 'react'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogActions from '@mui/material/DialogActions'
import CircularProgress from '@mui/material/CircularProgress'

import { useSession } from 'next-auth/react'
import { useSearchParams, useRouter } from 'next/navigation'

import { toast } from 'react-toastify'

const ClickUpLinkButton = () => {
  const { data: session } = useSession()

  const searchParams = useSearchParams()
  const router = useRouter()

  const [integration, setIntegration] = useState(null)
  const [workspaceReady, setWorkspaceReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [unlinkDialog, setUnlinkDialog] = useState(false)
  const [unlinking, setUnlinking] = useState(false)

  // Busca integração do usuário e se o workspace está configurado
  useEffect(() => {
    if (!session?.user?.id) return

    const fetchIntegration = async () => {
      try {
        const [userRes, workspaceRes] = await Promise.all([
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/${session.user.id}/integrations/clickup`),
          session.user.workspaceId
            ? fetch(`${process.env.NEXT_PUBLIC_API_URL}/workspaces/${session.user.workspaceId}/integrations/clickup`)
            : Promise.resolve(null)
        ])

        if (userRes.ok) {
          const data = await userRes.json()

          setIntegration(data)
        } else if (userRes.status === 404) {
          setIntegration(null)
        }

        if (workspaceRes?.ok) {
          const wsData = await workspaceRes.json()

          setWorkspaceReady(Boolean(wsData?.enabled && wsData?.configJson?.clientId && wsData?.configJson?.listId))
        } else {
          setWorkspaceReady(false)
        }
      } catch {
        setIntegration(null)
        setWorkspaceReady(false)
      } finally {
        setLoading(false)
      }
    }

    fetchIntegration()
  }, [session?.user?.id, session?.user?.workspaceId])

  // Trata feedback do OAuth
  useEffect(() => {
    const success = searchParams.get('success')
    const error = searchParams.get('error')

    if (!success && !error) return

    if (success === 'clickup_connected') {
      toast.success('Conta ClickUp vinculada com sucesso!')

      // Atualiza integração
      if (session?.user?.id) {
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/${session.user.id}/integrations/clickup`)
          .then(res => (res.ok ? res.json() : null))
          .then(data => setIntegration(data))
      }
    }

    if (error === 'clickup_not_in_workspace') {
      toast.error('Sua conta ClickUp não foi encontrada na lista de colaboradores deste workspace.')
    } else if (error === 'clickup_not_configured') {
      toast.error('Este workspace não possui integração ClickUp configurada.')
    } else if (error) {
      toast.error('Erro ao conectar conta ClickUp. Tente novamente.')
    }

    // Limpa query params da URL
    router.replace('/br/pages/account-settings')
  }, [searchParams, router, session?.user?.id])

  const handleConnect = () => {
    window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/auth/clickup`
  }

  const handleUnlink = async () => {
    setUnlinking(true)

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/${session.user.id}/integrations/clickup`, {
        method: 'DELETE'
      })

      if (!res.ok) {
        const data = await res.json()

        throw new Error(data.message || 'Erro ao desvincular')
      }

      setIntegration(null)

      toast.success('Conta ClickUp desvinculada com sucesso')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setUnlinking(false)
      setUnlinkDialog(false)
    }
  }

  return (
    <>
      <Card sx={{ mt: 6 }}>
        <CardContent className='flex flex-col gap-4'>
          <div className='flex items-center gap-2'>
            <i className='tabler-brand-clickup' style={{ fontSize: '1.5rem' }} />
            <Typography variant='h6'>Integração ClickUp</Typography>
          </div>

          <Divider />

          {loading ? (
            <div className='flex items-center gap-2'>
              <CircularProgress size={20} />
              <Typography variant='body2' color='text.secondary'>
                Verificando integração...
              </Typography>
            </div>
          ) : integration ? (
            <>
              <div className='flex flex-col gap-2'>
                <Typography variant='body2' color='text.secondary'>
                  Conta vinculada
                </Typography>

                <div className='flex flex-wrap gap-2'>
                  <Chip
                    icon={<i className='tabler-mail' />}
                    label={integration.accountEmail}
                    size='small'
                    color='primary'
                    variant='tonal'
                  />

                  {integration.configJson?.cargo && (
                    <Chip
                      icon={<i className='tabler-briefcase' />}
                      label={integration.configJson.cargo}
                      size='small'
                      color='secondary'
                      variant='tonal'
                    />
                  )}
                </div>
              </div>

              <div>
                <Button
                  variant='tonal'
                  color='error'
                  size='small'
                  startIcon={<i className='tabler-unlink' />}
                  onClick={() => setUnlinkDialog(true)}
                >
                  Desvincular conta
                </Button>
              </div>
            </>
          ) : (
            <>
              <Typography variant='body2' color='text.secondary'>
                {workspaceReady
                  ? 'Vincule sua conta ClickUp para integrar suas atividades ao sistema.'
                  : 'Este workspace ainda não possui integração ClickUp ativa. Peça ao administrador para configurar.'}
              </Typography>

              <div>
                <Button
                  variant='contained'
                  startIcon={<i className='tabler-brand-clickup' />}
                  onClick={handleConnect}
                  disabled={!workspaceReady}
                >
                  Conectar ClickUp
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={unlinkDialog} onClose={() => setUnlinkDialog(false)} maxWidth='xs' fullWidth>
        <DialogTitle>Desvincular conta ClickUp</DialogTitle>

        <DialogContent>
          <DialogContentText>
            Tem certeza que deseja desvincular sua conta ClickUp? Você poderá reconectar quando quiser.
          </DialogContentText>
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setUnlinkDialog(false)} color='secondary' disabled={unlinking}>
            Cancelar
          </Button>

          <Button onClick={handleUnlink} color='error' variant='contained' disabled={unlinking}>
            {unlinking ? 'Desvinculando...' : 'Desvincular'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

export default ClickUpLinkButton
