'use client'

import { useRef, useState, useEffect, useCallback } from 'react'

import IconButton from '@mui/material/IconButton'
import Badge from '@mui/material/Badge'
import Popper from '@mui/material/Popper'
import Fade from '@mui/material/Fade'
import Paper from '@mui/material/Paper'
import ClickAwayListener from '@mui/material/ClickAwayListener'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import Divider from '@mui/material/Divider'
import useMediaQuery from '@mui/material/useMediaQuery'
import Button from '@mui/material/Button'

import classnames from 'classnames'
import PerfectScrollbar from 'react-perfect-scrollbar'

import CustomAvatar from '@core/components/mui/Avatar'
import themeConfig from '@configs/themeConfig'
import { useSettings } from '@core/hooks/useSettings'

const POLL_INTERVAL = 30000

const ScrollWrapper = ({ children, hidden }) => {
  if (hidden) {
    return <div className='overflow-x-hidden bs-full'>{children}</div>
  } else {
    return (
      <PerfectScrollbar className='bs-full' options={{ wheelPropagation: false, suppressScrollX: true }}>
        {children}
      </PerfectScrollbar>
    )
  }
}

const typeConfig = {
  user_invited: { icon: 'tabler-user-plus', color: 'info' },
  user_role_changed: { icon: 'tabler-user-cog', color: 'warning' },
  user_status_changed: { icon: 'tabler-user-check', color: 'success' },
  user_status_pending: { icon: 'tabler-user-pause', color: 'warning' },
  user_deleted: { icon: 'tabler-user-minus', color: 'error' },
  dashboard_created: { icon: 'tabler-layout-dashboard', color: 'primary' },
  dashboard_deleted: { icon: 'tabler-layout-off', color: 'error' }
}

function timeAgo(dateStr) {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now - date
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return 'Agora mesmo'
  if (diffMin < 60) return `${diffMin}min atrás`

  const diffHours = Math.floor(diffMin / 60)

  if (diffHours < 24) return `${diffHours}h atrás`

  const diffDays = Math.floor(diffHours / 24)

  if (diffDays < 7) return `${diffDays}d atrás`

  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const NotificationDropdown = () => {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)

  const anchorRef = useRef(null)
  const ref = useRef(null)

  const hidden = useMediaQuery(theme => theme.breakpoints.down('lg'))
  const isSmallScreen = useMediaQuery(theme => theme.breakpoints.down('sm'))
  const { settings } = useSettings()

  const notificationCount = notifications.filter(n => !n.read).length
  const readAll = notifications.length > 0 && notifications.every(n => n.read)

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/apps/notifications')

      if (res.ok) {
        const data = await res.json()

        setNotifications(data)
      }
    } catch (err) {
      console.error('Erro ao buscar notificações:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, POLL_INTERVAL)

    return () => clearInterval(interval)
  }, [fetchNotifications])

  const handleClose = () => setOpen(false)
  const handleToggle = () => setOpen(prev => !prev)

  const markAsRead = async notificationId => {
    try {
      await fetch('/api/apps/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds: [notificationId] })
      })

      setNotifications(prev => prev.map(n => (n.id === notificationId ? { ...n, read: true } : n)))
    } catch (err) {
      console.error('Erro ao marcar notificação:', err)
    }
  }

  const markAllAsRead = async () => {
    try {
      await fetch('/api/apps/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ readAll: true })
      })

      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    } catch (err) {
      console.error('Erro ao marcar todas:', err)
    }
  }

  const handleRemoveNotification = (event, index) => {
    event.stopPropagation()
    setNotifications(prev => prev.filter((_, i) => i !== index))
  }

  useEffect(() => {
    const adjustPopoverHeight = () => {
      if (ref.current) {
        const availableHeight = window.innerHeight - 100

        ref.current.style.height = `${Math.min(availableHeight, 550)}px`
      }
    }

    window.addEventListener('resize', adjustPopoverHeight)

    return () => window.removeEventListener('resize', adjustPopoverHeight)
  }, [])

  return (
    <>
      <IconButton ref={anchorRef} onClick={handleToggle} className='text-textPrimary'>
        <Badge
          color='error'
          className='cursor-pointer'
          variant='dot'
          overlap='circular'
          invisible={notificationCount === 0}
          sx={{
            '& .MuiBadge-dot': { top: 6, right: 5, boxShadow: 'var(--mui-palette-background-paper) 0px 0px 0px 2px' }
          }}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <i className='tabler-bell' />
        </Badge>
      </IconButton>
      <Popper
        open={open}
        transition
        disablePortal
        placement='bottom-end'
        ref={ref}
        anchorEl={anchorRef.current}
        {...(isSmallScreen
          ? {
              className: 'is-full !mbs-3 z-[1] max-bs-[550px] bs-[550px]',
              modifiers: [
                {
                  name: 'preventOverflow',
                  options: { padding: themeConfig.layoutPadding }
                }
              ]
            }
          : { className: 'is-96 !mbs-3 z-[1] max-bs-[550px] bs-[550px]' })}
      >
        {({ TransitionProps, placement }) => (
          <Fade {...TransitionProps} style={{ transformOrigin: placement === 'bottom-end' ? 'right top' : 'left top' }}>
            <Paper className={classnames('bs-full', settings.skin === 'bordered' ? 'border shadow-none' : 'shadow-lg')}>
              <ClickAwayListener onClickAway={handleClose}>
                <div className='bs-full flex flex-col'>
                  <div className='flex items-center justify-between plb-3.5 pli-4 is-full gap-2'>
                    <Typography variant='h6' className='flex-auto'>
                      Notificações
                    </Typography>
                    {notificationCount > 0 && (
                      <Chip
                        size='small'
                        variant='tonal'
                        color='primary'
                        label={`${notificationCount} Nova${notificationCount > 1 ? 's' : ''}`}
                      />
                    )}
                    {notifications.length > 0 && (
                      <Tooltip
                        title={readAll ? 'Marcar todas como não lidas' : 'Marcar todas como lidas'}
                        placement={placement === 'bottom-end' ? 'left' : 'right'}
                      >
                        <IconButton size='small' onClick={markAllAsRead} className='text-textPrimary'>
                          <i className={readAll ? 'tabler-mail' : 'tabler-mail-opened'} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </div>
                  <Divider />
                  <ScrollWrapper hidden={hidden}>
                    {loading ? (
                      <div className='flex items-center justify-center p-6'>
                        <Typography variant='body2' color='text.secondary'>
                          Carregando...
                        </Typography>
                      </div>
                    ) : notifications.length === 0 ? (
                      <div className='flex items-center justify-center p-6'>
                        <Typography variant='body2' color='text.secondary'>
                          Nenhuma notificação
                        </Typography>
                      </div>
                    ) : (
                      notifications.map((notification, index) => {
                        const config = typeConfig[notification.type] || { icon: 'tabler-bell', color: 'primary' }

                        return (
                          <div
                            key={notification.id}
                            className={classnames('flex plb-3 pli-4 gap-3 cursor-pointer hover:bg-actionHover group', {
                              'border-be': index !== notifications.length - 1
                            })}
                            onClick={() => !notification.read && markAsRead(notification.id)}
                          >
                            <CustomAvatar color={config.color} skin='light-static' size={38}>
                              <i className={classnames(config.icon, 'text-[22px]')} />
                            </CustomAvatar>
                            <div className='flex flex-col flex-auto overflow-hidden'>
                              <Typography variant='body2' className='font-medium mbe-0.5' color='text.primary' noWrap>
                                {notification.title}
                              </Typography>
                              <Typography variant='caption' color='text.secondary' className='mbe-1' noWrap>
                                {notification.message}
                              </Typography>
                              <div className='flex items-center gap-2'>
                                <Typography variant='caption' color='text.disabled'>
                                  {timeAgo(notification.createdAt)}
                                </Typography>
                                {notification.workspace && (
                                  <Chip
                                    label={notification.workspace.name}
                                    size='small'
                                    variant='outlined'
                                    sx={{ height: 18, fontSize: '0.625rem' }}
                                  />
                                )}
                              </div>
                            </div>
                            <div className='flex flex-col items-end gap-2'>
                              <Badge
                                variant='dot'
                                color={notification.read ? 'secondary' : 'primary'}
                                className={classnames('mbs-1 mie-1', {
                                  'invisible group-hover:visible': notification.read
                                })}
                              />
                              <i
                                className='tabler-x text-xl invisible group-hover:visible'
                                onClick={e => handleRemoveNotification(e, index)}
                              />
                            </div>
                          </div>
                        )
                      })
                    )}
                  </ScrollWrapper>
                  <Divider />
                  <div className='p-4'>
                    <Button
                      fullWidth
                      variant='contained'
                      size='small'
                      onClick={markAllAsRead}
                      disabled={notificationCount === 0}
                    >
                      Marcar Todas como Lidas
                    </Button>
                  </div>
                </div>
              </ClickAwayListener>
            </Paper>
          </Fade>
        )}
      </Popper>
    </>
  )
}

export default NotificationDropdown
