'use client'

// React Imports
import { useEffect, useRef, useState } from 'react'

// Next Imports
import { useParams, useRouter } from 'next/navigation'

// MUI Imports
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import ClickAwayListener from '@mui/material/ClickAwayListener'
import Fade from '@mui/material/Fade'
import MenuList from '@mui/material/MenuList'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Popper from '@mui/material/Popper'
import Typography from '@mui/material/Typography'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import CircularProgress from '@mui/material/CircularProgress'

// Third-party Imports
import { useSession } from 'next-auth/react'

// Hook Imports
import { useSettings } from '@core/hooks/useSettings'

const WorkspaceSwitcher = () => {
  // States
  const [open, setOpen] = useState(false)
  const [workspaces, setWorkspaces] = useState([])
  const [currentWorkspace, setCurrentWorkspace] = useState(null)
  const [loading, setLoading] = useState(true)

  // Refs
  const anchorRef = useRef(null)

  // Hooks
  const { data: session } = useSession()
  const { settings } = useSettings()
  const params = useParams()
  const router = useRouter()
  const locale = params?.lang || 'en'

  const isSuperAdmin = session?.user?.role === 'superAdmin'
  const isSubAdmin = session?.user?.role === 'subAdmin'
  const isHighAdmin = isSuperAdmin || isSubAdmin

  // Fetch workspace(s) on mount
  useEffect(() => {
    if (!session) return

    const fetchWorkspaces = async () => {
      try {
        if (isHighAdmin) {
          // High admins: fetch all workspaces
          const res = await fetch('/api/apps/workspaces')

          if (res.ok) {
            const data = await res.json()

            setWorkspaces(data)

            // Set the first workspace as current if none selected
            if (data.length > 0) {
              const savedId = localStorage.getItem('activeWorkspaceId')
              const saved = data.find(w => w.id === savedId)
              const selected = saved || data[0]

              setCurrentWorkspace(selected)

              // Always sync BOTH localStorage and cookie so server and client agree
              localStorage.setItem('activeWorkspaceId', selected.id)
              document.cookie = `activeWorkspaceId=${selected.id}; path=/; max-age=${30 * 24 * 60 * 60}; SameSite=Lax`

              // Notify sidebar menu to refresh with the correct workspace
              window.dispatchEvent(new Event('workspace-changed'))
            }
          }
        } else {
          // Regular user: fetch only their workspace
          const workspaceId = session.user.workspaceId

          if (workspaceId) {
            const res = await fetch(`/api/apps/workspaces/${workspaceId}`)

            if (res.ok) {
              const data = await res.json()

              setCurrentWorkspace(data)
            }
          }
        }
      } catch (error) {
        console.error('Error fetching workspaces:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchWorkspaces()
  }, [session, isHighAdmin])

  const handleToggle = () => {
    if (isHighAdmin) {
      setOpen(prevOpen => !prevOpen)
    }
  }

  const handleClose = () => {
    setOpen(false)
  }

  const handleSelectWorkspace = workspace => {
    setCurrentWorkspace(workspace)
    localStorage.setItem('activeWorkspaceId', workspace.id)

    // Sync cookie so server components can read the active workspace
    document.cookie = `activeWorkspaceId=${workspace.id}; path=/; max-age=${30 * 24 * 60 * 60}; SameSite=Lax`
    setOpen(false)

    // Notify other components (e.g. VerticalMenu) to refresh
    window.dispatchEvent(new Event('workspace-changed'))

    // Navigate to dashboards home so server re-evaluates the correct workspace dashboard
    router.push(`/${locale}/dashboards`)
  }

  if (loading) {
    return <CircularProgress size={20} />
  }

  if (!currentWorkspace) {
    return null
  }

  // Regular user: static chip (non-clickable)
  if (!isHighAdmin) {
    return (
      <Chip
        icon={<i className='tabler-building-hospital text-base' />}
        label={currentWorkspace.name}
        size='small'
        sx={{ bgcolor: '#EB8A5F', color: '#FFF', '& .MuiChip-icon': { color: '#FFF' } }}
      />
    )
  }

  // High admin: dropdown to switch workspaces
  return (
    <>
      <Button
        ref={anchorRef}
        onClick={handleToggle}
        variant='contained'
        size='small'
        startIcon={<i className='tabler-building-hospital text-base' />}
        endIcon={<i className='tabler-chevron-down text-base' />}
        sx={{ bgcolor: '#EB8A5F', color: '#FFF', '&:hover': { bgcolor: '#E66C37' } }}
      >
        {currentWorkspace.name}
      </Button>
      <Popper
        open={open}
        transition
        disablePortal
        placement='bottom-start'
        anchorEl={anchorRef.current}
        className='min-is-[220px] !mbs-3 z-[1]'
      >
        {({ TransitionProps, placement }) => (
          <Fade
            {...TransitionProps}
            style={{ transformOrigin: placement === 'bottom-start' ? 'left top' : 'right top' }}
          >
            <Paper className={settings.skin === 'bordered' ? 'border shadow-none' : 'shadow-lg'}>
              <ClickAwayListener onClickAway={handleClose}>
                <MenuList onKeyDown={handleClose}>
                  <div className='pli-4 plb-2'>
                    <Typography variant='caption' color='text.disabled' className='uppercase'>
                      Espaços de Trabalho
                    </Typography>
                  </div>
                  {workspaces.map(workspace => (
                    <MenuItem
                      key={workspace.id}
                      onClick={() => handleSelectWorkspace(workspace)}
                      selected={currentWorkspace.id === workspace.id}
                    >
                      <ListItemIcon>
                        <i className='tabler-building-hospital' />
                      </ListItemIcon>
                      <ListItemText
                        primary={workspace.name}
                        secondary={workspace.slug}
                        primaryTypographyProps={{ variant: 'body2' }}
                        secondaryTypographyProps={{ variant: 'caption' }}
                      />
                    </MenuItem>
                  ))}
                </MenuList>
              </ClickAwayListener>
            </Paper>
          </Fade>
        )}
      </Popper>
    </>
  )
}

export default WorkspaceSwitcher
