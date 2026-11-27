'use client'

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'

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
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import useMediaQuery from '@mui/material/useMediaQuery'

const FOCUS_MODE_STORAGE_KEY = 'dashboardFocusMode'

// Piso da área do relatório: abaixo disso o Power BI fica ilegível, então é melhor deixar a página rolar
const MIN_FRAME_HEIGHT = 320

// Folga entre o fim da área do relatório e o rodapé da janela
const FRAME_BOTTOM_GAP = 16

// Rodapé do "Publicar na Web" (barra de zoom 23px + barra "Microsoft Power BI / páginas" 37px). É do visualizador,
// não do relatório, então tem a mesma altura em todo dashboard. O iframe fica mais alto que a caixa e o rodapé
// sai pela borda de baixo (overflow hidden). Se a Microsoft mudar essa altura, ajuste só aqui.
const POWERBI_FOOTER_HEIGHT = 60

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
  const [focusMode, setFocusMode] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [fullscreenSupported, setFullscreenSupported] = useState(false)
  const [frameHeight, setFrameHeight] = useState(null)
  const viewAuditSentRef = useRef('')
  const frameRef = useRef(null)

  // No celular o Power BI pode usar outro layout e outra barra; o corte só vale de tablet para cima
  const hidePowerBiFooter = useMediaQuery(theme => theme.breakpoints.up('sm'), { noSsr: true })

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

  useEffect(() => {
    setFullscreenSupported(Boolean(document.fullscreenEnabled))

    try {
      setFocusMode(window.localStorage.getItem(FOCUS_MODE_STORAGE_KEY) === '1')
    } catch {
      // localStorage indisponível (modo privado restrito): segue sem lembrar a preferência
    }

    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(frameRef.current) && document.fullscreenElement === frameRef.current)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)

    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  // A altura vem da posição real da área na página, para o relatório ir até o fim da janela sem rolagem,
  // qualquer que seja a altura da barra superior, do título ou do modo foco
  const updateFrameHeight = useCallback(() => {
    const el = frameRef.current

    if (!el || document.fullscreenElement) return

    const top = el.getBoundingClientRect().top + window.scrollY
    const cardPaddingBottom = parseFloat(window.getComputedStyle(el.parentElement).paddingBottom) || 0
    const available = window.innerHeight - top - cardPaddingBottom - FRAME_BOTTOM_GAP

    setFrameHeight(Math.max(Math.floor(available), MIN_FRAME_HEIGHT))
  }, [])

  useLayoutEffect(() => {
    if (!dashboard) return

    updateFrameHeight()
    window.addEventListener('resize', updateFrameHeight)

    return () => window.removeEventListener('resize', updateFrameHeight)
  }, [dashboard, focusMode, isFullscreen, updateFrameHeight])

  const toggleFocusMode = () => {
    setFocusMode(prev => {
      const next = !prev

      try {
        window.localStorage.setItem(FOCUS_MODE_STORAGE_KEY, next ? '1' : '0')
      } catch {
        // sem persistência, só vale para esta visita
      }

      return next
    })
  }

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await frameRef.current?.requestFullscreen()
      }
    } catch {
      // o navegador pode recusar (ex.: permissão de iframe pai); a visualização normal continua funcionando
    }
  }

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
      <CardContent sx={{ p: focusMode ? { xs: 1, md: 2 } : { xs: 3, md: 4 } }}>
        <Box
          display='flex'
          alignItems='center'
          justifyContent={focusMode ? 'flex-end' : 'space-between'}
          gap={2}
          mb={focusMode ? 1 : { xs: 2, md: 3 }}
        >
          {!focusMode && (
            <Box display='flex' alignItems='center' gap={2} flexWrap='wrap' minWidth={0}>
              <Typography variant='h5' fontWeight={600} noWrap>
                {dashboard.title}
              </Typography>
              {dashboard.workspace?.name && <Chip label={dashboard.workspace.name} size='small' color='primary' />}
            </Box>
          )}
          <Box display='flex' alignItems='center' gap={0.5} flexShrink={0}>
            <Tooltip title={focusMode ? 'Sair do modo foco' : 'Modo foco: esconde o título e amplia o relatório'}>
              <IconButton
                size='small'
                onClick={toggleFocusMode}
                aria-pressed={focusMode}
                aria-label={focusMode ? 'Sair do modo foco' : 'Ativar modo foco'}
                color={focusMode ? 'primary' : 'default'}
              >
                <i className='tabler-focus-2' />
              </IconButton>
            </Tooltip>
            {fullscreenSupported && (
              <Tooltip title='Tela cheia (Esc para sair)'>
                <IconButton size='small' onClick={toggleFullscreen} aria-label='Abrir dashboard em tela cheia'>
                  <i className='tabler-maximize' />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>
        <Box
          ref={frameRef}
          sx={{
            position: 'relative',
            overflow: 'hidden',
            width: '100%',
            // Altura medida até o fim da janela; o calc só vale no primeiro render, antes da medição
            height: frameHeight ? `${frameHeight}px` : { xs: 'calc(100dvh - 180px)', md: 'calc(100dvh - 160px)' },
            minHeight: MIN_FRAME_HEIGHT,
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            '&:fullscreen': {
              height: '100%',
              minHeight: 0,
              border: 0,
              borderRadius: 0
            }
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
              height: hidePowerBiFooter ? `calc(100% + ${POWERBI_FOOTER_HEIGHT}px)` : '100%',
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
