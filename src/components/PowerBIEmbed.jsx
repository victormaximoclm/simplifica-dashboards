'use client'

import { useEffect, useRef, useState } from 'react'
import { models, service, factories } from 'powerbi-client'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'

const powerbiService = new service.Service(factories.hpmFactory, factories.wpmpFactory, factories.routerFactory)

export default function PowerBIEmbed({ dashboardId }) {
  const containerRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const embed = async () => {
      try {
        const res = await fetch(`/api/apps/dashboards/${dashboardId}/embed-token`)
        if (!res.ok) throw new Error('Não foi possível carregar o dashboard.')
        const { embedToken, embedUrl, reportId } = await res.json()

        if (!containerRef.current) return

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
        setLoading(false)
      }
    }

    embed()

    return () => {
      if (containerRef.current) powerbiService.reset(containerRef.current)
    }
  }, [dashboardId])

  if (error) {
    return <Alert severity='error'>{error}</Alert>
  }

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '600px' }}>
      {loading && (
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      )}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </Box>
  )
}
