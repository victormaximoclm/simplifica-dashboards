'use client'

import { useState, useEffect, useRef } from 'react'

import { useParams, useRouter } from 'next/navigation'

import { useSession } from 'next-auth/react'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import Button from '@mui/material/Button'

const DashboardViewer = () => {
  const params = useParams()
  const router = useRouter()
  const { data: session } = useSession()
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [iframeError, setIframeError] = useState(false)
  const [iframeTimedOut, setIframeTimedOut] = useState(false)
  const [iframeReloadKey, setIframeReloadKey] = useState(0)
  const viewAuditSentRef = useRef('')

  const dashboardId = params?.id
  const locale = params?.lang || 'br'
  const isHighAdmin = session?.user?.role === 'superAdmin' || session?.user?.role === 'subAdmin'

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const res = await fetch(`/api/apps/dashboards/${dashboardId}`)

        if (res.ok) {
          const data = await res.json()

          // For high admins: validate dashboard belongs to the active workspace
          if (isHighAdmin && data.workspaceId) {
            const match = document.cookie.match(/(?:^|;\s*)activeWorkspaceId=([^;]*)/)
            const activeWsId = match ? decodeURIComponent(match[1]) : null

            if (activeWsId && data.workspaceId !== activeWsId) {
              // Dashboard doesn't belong to active workspace — redirect to re-evaluate
              router.replace(`/${locale}/dashboards`)

              return
            }
          }

          setDashboard(data)
        } else {
          const data = await res.json()

          setError(data.message || 'Erro ao carregar dashboard')
        }
      } catch {
        setError('Erro de conexão')
      } finally {
        setLoading(false)
      }
    }

    if (dashboardId) {
      fetchDashboard()
    }
  }, [dashboardId, isHighAdmin, locale, router])

  useEffect(() => {
    if (!dashboard) return

    setIframeLoaded(false)
    setIframeError(false)
    setIframeTimedOut(false)

    const timeoutId = setTimeout(() => {
      setIframeTimedOut(true)
    }, 10000)

    return () => clearTimeout(timeoutId)
  }, [dashboard, iframeReloadKey])

  useEffect(() => {
    if (!dashboard?.id) return
    if (viewAuditSentRef.current === dashboard.id) return

    viewAuditSentRef.current = dashboard.id
    fetch('/api/audit/dashboard-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dashboardId: dashboard.id })
    }).catch(() => {})
  }, [dashboard?.id])

  if (loading) {
    return (
      <Box display='flex' justifyContent='center' alignItems='center' minHeight='60vh'>
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return (
      <Alert severity='error' sx={{ m: 2 }}>
        {error}
      </Alert>
    )
  }

  if (!dashboard) return null

  const handleReloadIframe = () => {
    setIframeReloadKey(prev => prev + 1)
  }

  return (
    <Card>
      <CardContent>
        <Box display='flex' alignItems='center' justifyContent='space-between' mb={3}>
          <Box>
            <Typography variant='h5' fontWeight={600}>
              {dashboard.title}
            </Typography>
            <Chip label={dashboard.workspace?.name} size='small' color='primary' sx={{ mt: 1 }} />
          </Box>
        </Box>
        <Box
          sx={{
            position: 'relative',
            overflow: 'hidden',
            width: '100%',
            paddingTop: '56.25%', // 16:9 aspect ratio
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'divider'
          }}
        >
          {!iframeLoaded && !iframeError && (
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                zIndex: 2,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                px: 3,
                bgcolor: 'background.paper'
              }}
            >
              <Skeleton variant='text' width='45%' height={38} sx={{ mb: 1 }} />
              <Skeleton variant='rectangular' width='100%' height='55%' sx={{ borderRadius: 1, mb: 2 }} />
              <Typography variant='body2' color='text.secondary'>
                {iframeTimedOut
                  ? 'O dashboard está demorando mais que o normal para carregar.'
                  : 'Conectando ao Power BI e carregando visualizações...'}
              </Typography>
              {iframeTimedOut && (
                <Box sx={{ mt: 2 }}>
                  <Button size='small' variant='outlined' onClick={handleReloadIframe}>
                    Recarregar painel
                  </Button>
                </Box>
              )}
            </Box>
          )}

          {iframeError && (
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                zIndex: 3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                p: 2,
                bgcolor: 'background.paper'
              }}
            >
              <Alert
                severity='warning'
                action={
                  <Button color='inherit' size='small' onClick={handleReloadIframe}>
                    Tentar novamente
                  </Button>
                }
              >
                Não foi possível carregar o dashboard agora.
              </Alert>
            </Box>
          )}

          <iframe
            key={iframeReloadKey}
            title={dashboard.title}
            src={`/api/embed/dashboard/${dashboard.id}`}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              border: 0,
              opacity: iframeLoaded ? 1 : 0,
              transition: 'opacity 260ms ease'
            }}
            referrerPolicy='same-origin'
            allowFullScreen
            onLoad={() => setIframeLoaded(true)}
            onError={() => setIframeError(true)}
          />
        </Box>
      </CardContent>
    </Card>
  )
}

export default DashboardViewer
