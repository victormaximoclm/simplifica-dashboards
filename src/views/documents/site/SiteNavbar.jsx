'use client'

import { useState } from 'react'

import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Tooltip from '@mui/material/Tooltip'

/**
 * Barra de navegação superior do Site: uma entrada por página raiz. Raízes com subpáginas abrem um menu com as
 * subpáginas (e as de terceiro nível, recuadas); a raiz da página aberta fica destacada.
 */

// Lista plana (com recuo) de todas as descendentes de uma raiz
function flattenChildren(node, depth = 0) {
  return node.children.flatMap(child => [{ page: child, depth }, ...flattenChildren(child, depth + 1)])
}

const NavEntry = ({ root, selectedId, activeRootId, onSelect }) => {
  const [anchorEl, setAnchorEl] = useState(null)

  const isActive = root.id === activeRootId
  const entries = flattenChildren(root)

  const sx = {
    flexShrink: 0,
    borderRadius: 0,
    textTransform: 'none',
    fontWeight: isActive ? 600 : 400,
    borderBottom: '2px solid',
    borderColor: isActive ? 'primary.main' : 'transparent',
    color: isActive ? 'primary.main' : 'text.primary',
    minHeight: 56
  }

  if (!entries.length) {
    return (
      <Button color='inherit' aria-current={root.id === selectedId ? 'page' : undefined} onClick={() => onSelect(root.id)} sx={sx}>
        {root.title}
      </Button>
    )
  }

  return (
    <>
      <Button
        color='inherit'
        aria-haspopup='menu'
        aria-expanded={!!anchorEl}
        onClick={event => setAnchorEl(event.currentTarget)}
        endIcon={<i className='tabler-chevron-down text-base' />}
        sx={sx}
      >
        {root.title}
      </Button>
      <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={() => setAnchorEl(null)} slotProps={{ paper: { sx: { minWidth: 220 } } }}>
        <MenuItem
          selected={root.id === selectedId}
          onClick={() => {
            setAnchorEl(null)
            onSelect(root.id)
          }}
        >
          {root.title}
        </MenuItem>
        {entries.map(({ page, depth }) => (
          <MenuItem
            key={page.id}
            selected={page.id === selectedId}
            onClick={() => {
              setAnchorEl(null)
              onSelect(page.id)
            }}
            sx={{ paddingInlineStart: `${1.5 + (depth + 1) * 1.25}rem` }}
          >
            {page.title}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}

const SiteNavbar = ({ siteName, tree, selectedId, activeRootId, onSelect, onBack, onOpenMenu, actions }) => (
  <header className='flex items-center gap-2 px-2 sm:px-4 border-b border-[var(--mui-palette-divider)] min-h-14'>
    <Tooltip title='Voltar à pasta'>
      <IconButton aria-label='Voltar à pasta' onClick={onBack} size='small'>
        <i className='tabler-arrow-left' />
      </IconButton>
    </Tooltip>

    <div className='flex items-center gap-2 min-w-0 pe-2'>
      <i className='tabler-world text-xl shrink-0 text-[var(--mui-palette-primary-main)]' />
      <span className='truncate font-semibold max-w-[40vw] md:max-w-[16rem] text-[var(--mui-palette-text-primary)]' title={siteName}>
        {siteName}
      </span>
    </div>

    <nav aria-label={`Páginas de ${siteName}`} className='hidden md:flex flex-1 min-w-0 items-stretch overflow-x-auto'>
      {tree.map(root => (
        <NavEntry key={root.id} root={root} selectedId={selectedId} activeRootId={activeRootId} onSelect={onSelect} />
      ))}
    </nav>

    <div className='flex items-center gap-1 ms-auto shrink-0'>
      {actions}
      <IconButton aria-label='Abrir menu de páginas' onClick={onOpenMenu} className='md:hidden'>
        <i className='tabler-menu-2' />
      </IconButton>
    </div>
  </header>
)

export default SiteNavbar
