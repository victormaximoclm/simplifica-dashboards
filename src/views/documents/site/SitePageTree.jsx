'use client'

import { useMemo, useState } from 'react'

import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'

import { buildSitePagePath, buildSitePageTree } from '@/libs/documentSite'

/**
 * Menu de páginas do Site em árvore. As páginas no caminho da página aberta ficam expandidas por padrão;
 * o usuário pode expandir ou recolher qualquer item (a escolha dele prevalece).
 */
const SitePageTree = ({ pages, selectedId, onSelect, label }) => {
  const [overrides, setOverrides] = useState({})

  const tree = useMemo(() => buildSitePageTree(pages), [pages])
  const pathIds = useMemo(() => new Set(buildSitePagePath(pages, selectedId).map(page => page.id)), [pages, selectedId])

  const isOpen = id => overrides[id] ?? pathIds.has(id)
  const toggle = id => setOverrides(current => ({ ...current, [id]: !isOpen(id) }))

  const renderItem = (page, depth) => {
    const hasChildren = page.children.length > 0
    const open = hasChildren && isOpen(page.id)

    return (
      <li key={page.id}>
        <ListItemButton
          selected={page.id === selectedId}
          aria-current={page.id === selectedId ? 'page' : undefined}
          onClick={() => onSelect(page.id)}
          sx={{ paddingInlineStart: `${1 + depth * 1.25}rem`, paddingInlineEnd: '0.5rem', py: 0.75, borderRadius: 1 }}
        >
          <ListItemText
            primary={page.title}
            primaryTypographyProps={{ noWrap: true, fontWeight: page.id === selectedId ? 600 : 400 }}
            title={page.title}
          />
          {hasChildren && (
            <IconButton
              size='small'
              aria-label={`${open ? 'Recolher' : 'Expandir'} ${page.title}`}
              aria-expanded={open}
              onClick={event => {
                event.stopPropagation()
                toggle(page.id)
              }}
            >
              <i className={open ? 'tabler-chevron-down' : 'tabler-chevron-right'} />
            </IconButton>
          )}
        </ListItemButton>
        {hasChildren && (
          <Collapse in={open} timeout='auto' unmountOnExit>
            <List disablePadding component='ul'>
              {page.children.map(child => renderItem(child, depth + 1))}
            </List>
          </Collapse>
        )}
      </li>
    )
  }

  return (
    <nav aria-label={label}>
      <List disablePadding component='ul'>
        {tree.map(page => renderItem(page, 0))}
      </List>
    </nav>
  )
}

export default SitePageTree
