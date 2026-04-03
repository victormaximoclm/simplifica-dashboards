'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { models, service, factories } from 'powerbi-client'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'

const powerbiService = new service.Service(factories.hpmFactory, factories.wpmpFactory, factories.routerFactory)

const DashboardViewer = () => {
  const params = useParams()
  const router = useRouter()
  const { data: session } = useSession()
  const containerRef = useRef(null)

  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [embedLoading, setEmbedLoading] = useState(true)
  const [error, setError] = useState('')

  const dashboardId = params?.id
  const locale = params?.lang || 'br'
  const isHighAdmin = session?.user?.role === 'superAdmin' || session?.user?.role === 'subAdmin'

  // 1. Busca os dados do dashboard (título, workspace, etc.)
  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const res = await fetch(`/api/apps/dashboards/${dashboardId}`)

        if (res.ok) {
          const data = await res.json()

          if (isHighAdmin && data.workspaceId) {
            const match = document.cookie.match(/(?:^|;\s*)activeWorkspaceId=([^;]*)/)
            const activeWsId = match ? decodeURIComponent(match[1]) : null

            if (activeWsId && data.workspaceId !== activeWsId) {
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

    if (dashboardId) fetchDashboard()
  }, [dashboardId, isHighAdmin, locale, router])

  // 2. Após ter os dados do dashboard, busca o embed token e renderiza
  useEffect(() => {
    if (!dashboard || !containerRef.current) return

    const embedDashboard = async () => {
      try {
        const res = await fetch(`/api/apps/dashboards/${dashboardId}/embed-token`)

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.message || 'Erro ao gerar token de embed')
        }

        const { embedToken, embedUrl, reportId } = await res.json()

        const config = {
          type: 'report',
          id: reportId,
          embedUrl,
          accessToken: embedToken,
          tokenType: models.TokenType.Embed,
          settings: {
            navContentPaneEnabled: false,
            filterPaneEnabled: false,
            background: models.BackgroundType.Transparent
          }
        }

        powerbiService.embed(containerRef.current, config)
      } catch (err) {
        setError(err.message)
      } finally {
        setEmbedLoading(false)
      }
    }

    embedDashboard()

    return () => {
      if (containerRef.current) powerbiService.reset(containerRef.current)
    }
  }, [dashboard, dashboardId])

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

  return (
    <Card>
      <CardContent>
        <Box display='flex' alignItems='center' justifyContent='space-between' mb={3}>
          <Box>
            <Typography variant='h5' fontWeight={600}>
              {dashboard.title}
            </Typography>
            <Chip label={dashboard.workspace?.name} size='small' sx={{ mt: 1, bgcolor: '#EB8A5F', color: '#FFF' }} />
          </Box>
        </Box>

        <Box
          sx={{
            position: 'relative',
            width: '100%',
            height: '600px',
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'divider',
            overflow: 'hidden'
          }}
        >
          {embedLoading && (
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'background.paper',
                zIndex: 1
              }}
            >
              <CircularProgress />
            </Box>
          )}
          <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        </Box>
      </CardContent>
    </Card>
  )
}

export default DashboardViewer
