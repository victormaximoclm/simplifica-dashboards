'use client'

// Next Imports
import { useState, useEffect, useCallback } from 'react'

import { useParams } from 'next/navigation'

// React Imports

// MUI Imports
import { useTheme } from '@mui/material/styles'

// Third-party Imports
import PerfectScrollbar from 'react-perfect-scrollbar'
import { useSession } from 'next-auth/react'

// Component Imports
import { Menu, SubMenu, MenuItem, MenuSection } from '@menu/vertical-menu'
import CustomChip from '@core/components/mui/Chip'

// Hook Imports
import useVerticalNav from '@menu/hooks/useVerticalNav'

// Styled Component Imports
import StyledVerticalNavExpandIcon from '@menu/styles/vertical/StyledVerticalNavExpandIcon'

// Style Imports
import menuItemStyles from '@core/styles/vertical/menuItemStyles'
import menuSectionStyles from '@core/styles/vertical/menuSectionStyles'

const RenderExpandIcon = ({ open, transitionDuration }) => (
  <StyledVerticalNavExpandIcon open={open} transitionDuration={transitionDuration}>
    <i className='tabler-chevron-right' />
  </StyledVerticalNavExpandIcon>
)

const VerticalMenu = ({ dictionary, scrollMenu }) => {
  // Hooks
  const theme = useTheme()
  const verticalNavOptions = useVerticalNav()
  const params = useParams()
  const { data: session } = useSession()
  const [dashboards, setDashboards] = useState([])
  const [forms, setForms] = useState([])

  // Vars
  const { isBreakpointReached, transitionDuration } = verticalNavOptions
  const { lang: locale } = params
  const ScrollWrapper = isBreakpointReached ? 'div' : PerfectScrollbar
  const isSuperAdmin = session?.user?.role === 'superAdmin'
  const isSubAdmin = session?.user?.role === 'subAdmin'
  const isHighAdmin = isSuperAdmin || isSubAdmin
  const isAdmin = session?.user?.role === 'admin'

  // Helper to read activeWorkspaceId from cookie (fallback when localStorage is empty)
  const getActiveWorkspaceId = useCallback(() => {
    // Try localStorage first
    const fromStorage = localStorage.getItem('activeWorkspaceId')

    if (fromStorage) return fromStorage

    // Fallback: read from cookie
    const match = document.cookie.match(/(?:^|;\s*)activeWorkspaceId=([^;]*)/)

    return match ? decodeURIComponent(match[1]) : null
  }, [])

  // Fetch dashboards filtered by active workspace
  const fetchDashboards = useCallback(() => {
    if (!session) return

    let url = '/api/apps/dashboards'

    if (isHighAdmin) {
      const activeWsId = getActiveWorkspaceId()

      if (activeWsId) {
        url += `?workspaceId=${activeWsId}`
      } else {
        // No workspace selected yet — don't load dashboards until workspace is initialized
        setDashboards([])

        return
      }
    }

    fetch(url, { cache: 'no-store' })
      .then(res => (res.ok ? res.json() : []))
      .then(data => setDashboards(data))
      .catch(() => setDashboards([]))
  }, [getActiveWorkspaceId, isHighAdmin, session])

  const fetchForms = useCallback(() => {
    if (!session) return

    let url = '/api/forms'

    if (isHighAdmin) {
      const activeWsId = getActiveWorkspaceId()

      if (activeWsId) {
        url += `?workspaceId=${activeWsId}`
      } else {
        setForms([])

        return
      }
    }

    fetch(url, { cache: 'no-store' })
      .then(res => (res.ok ? res.json() : []))
      .then(data => setForms(data))
      .catch(() => setForms([]))
  }, [getActiveWorkspaceId, isHighAdmin, session])

  const getFormHref = formId => `/${locale}/forms/${formId}/fill`

  useEffect(() => {
    if (!session) {
      setDashboards([])
      setForms([])

      return
    }

    fetchDashboards()
    fetchForms()
    window.addEventListener('workspace-changed', fetchDashboards)
    window.addEventListener('dashboards-changed', fetchDashboards)
    window.addEventListener('workspace-changed', fetchForms)
    window.addEventListener('forms-changed', fetchForms)

    return () => {
      window.removeEventListener('workspace-changed', fetchDashboards)
      window.removeEventListener('dashboards-changed', fetchDashboards)
      window.removeEventListener('workspace-changed', fetchForms)
      window.removeEventListener('forms-changed', fetchForms)
    }
  }, [fetchDashboards, fetchForms, session])

  return (
    <ScrollWrapper
      {...(isBreakpointReached
        ? {
            className: 'bs-full overflow-y-auto overflow-x-hidden',
            onScroll: container => scrollMenu(container, false)
          }
        : {
            options: { wheelPropagation: false, suppressScrollX: true },
            onScrollY: container => scrollMenu(container, true)
          })}
    >
      <Menu
        popoutMenuOffset={{ mainAxis: 23 }}
        menuItemStyles={menuItemStyles(verticalNavOptions, theme)}
        renderExpandIcon={({ open }) => <RenderExpandIcon open={open} transitionDuration={transitionDuration} />}
        renderExpandedMenuItemIcon={{ icon: <i className='tabler-circle text-xs' /> }}
        menuSectionStyles={menuSectionStyles(verticalNavOptions, theme)}
      >
        <SubMenu
          label={dictionary['navigation'].dashboards}
          icon={<i className='tabler-smart-home' />}
          suffix={
            dashboards.length > 0 ? <CustomChip label={String(dashboards.length)} size='small' round='true' /> : null
          }
        >
          {dashboards.map(db => (
            <MenuItem key={db.id} href={`/${locale}/dashboards/view/${db.id}`}>
              {db.title}
            </MenuItem>
          ))}
          {dashboards.length === 0 && <MenuItem disabled>Nenhum dashboard disponível</MenuItem>}
          {isHighAdmin && (
            <MenuItem href={`/${locale}/dashboards/manage`} icon={<i className='tabler-settings' />}>
              {dictionary['navigation'].manageDashboards}
            </MenuItem>
          )}
        </SubMenu>
        {session && (
          <SubMenu
            label={dictionary['navigation'].forms || 'Formulários'}
            icon={<i className='tabler-forms' />}
            suffix={forms.length > 0 ? <CustomChip label={String(forms.length)} size='small' round='true' /> : null}
          >
            {forms.map(form => (
              <MenuItem key={form.id} href={getFormHref(form.id)}>
                {form.title}
              </MenuItem>
            ))}
            {forms.length === 0 && <MenuItem disabled>Nenhum formulário disponível</MenuItem>}
            {(isHighAdmin || isAdmin) && (
              <MenuItem href={`/${locale}/forms`} icon={<i className='tabler-settings' />}>
                {dictionary['navigation'].manageForms || 'Gerenciar Formulários'}
              </MenuItem>
            )}
          </SubMenu>
        )}
        {(isHighAdmin || isAdmin) && (
          <MenuSection label={dictionary['navigation'].appsPages}>
            <MenuItem href={`/${locale}/apps/user/list`} icon={<i className='tabler-user' />}>
              {dictionary['navigation'].list}
            </MenuItem>
            {isHighAdmin && (
              <MenuItem href={`/${locale}/apps/roles`} icon={<i className='tabler-lock' />}>
                {dictionary['navigation'].roles}
              </MenuItem>
            )}
            {isHighAdmin && (
              <MenuItem href={`/${locale}/apps/workspaces`} icon={<i className='tabler-building' />}>
                {dictionary['navigation'].workspaces}
              </MenuItem>
            )}
            {isHighAdmin && (
              <>
                <MenuItem href={`/${locale}/apps/audit-logs`} icon={<i className='tabler-shield-search' />}>
                  {dictionary['navigation'].auditAccess || dictionary['navigation'].auditLogs || 'Audit de Acesso'}
                </MenuItem>
                <MenuItem href={`/${locale}/apps/audit-actions`} icon={<i className='tabler-alert-triangle' />}>
                  {dictionary['navigation'].auditActions || 'Audit de Ações'}
                </MenuItem>
              </>
            )}
          </MenuSection>
        )}
      </Menu>
    </ScrollWrapper>
  )
}

export default VerticalMenu
