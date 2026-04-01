'use client'

import { useState, useEffect } from 'react'

import { useParams, useRouter } from 'next/navigation'

import { useSession } from 'next-auth/react'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'

const isSafeEmbedUrl = url => {
  try {
    const parsed = new URL(String(url || '').trim())

    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

const DashboardViewer = () => {
  const params = useParams()
  const router = useRouter()
  const { data: session } = useSession()
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

  if (!isSafeEmbedUrl(dashboard.embedUrl)) {
    return (
      <Alert severity='error' sx={{ m: 2 }}>
        URL de dashboard inválida.
      </Alert>
    )
  }

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
            overflow: 'hidden',
            width: '100%',
            paddingTop: '56.25%', // 16:9 aspect ratio
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'divider'
          }}
        >
          <iframe
            title={dashboard.title}
            src={dashboard.embedUrl}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              border: 0
            }}
            allowFullScreen
          />
        </Box>
      </CardContent>
    </Card>
  )
}

export default DashboardViewer
