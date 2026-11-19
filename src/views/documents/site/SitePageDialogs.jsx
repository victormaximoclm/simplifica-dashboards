'use client'

import { useMemo, useState } from 'react'

import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import TextField from '@mui/material/TextField'

import { DOCUMENT_SITE_LIMITS, buildSitePageTree, getSitePageDepth, planSitePageMove } from '@/libs/documentSite'

/**
 * Diálogos de gerenciamento de páginas do Site. Monte só quando for abrir (o estado começa limpo a cada abertura).
 * Os `onSubmit`/`onConfirm` devolvem uma mensagem de erro (texto) ou nada, em caso de sucesso.
 */

/** Nome da página: criar (página ou subpágina) e renomear */
export const PageTitleDialog = ({ heading, initialTitle = '', confirmLabel, onClose, onSubmit }) => {
  const [title, setTitle] = useState(initialTitle)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async event => {
    event.preventDefault()

    const value = title.trim()

    if (!value) {
      setError('Título é obrigatório')

      return
    }

    setSaving(true)
    setError('')

    const message = await onSubmit(value)

    setSaving(false)
    if (message) setError(message)
  }

  return (
    <Dialog open onClose={saving ? undefined : onClose} maxWidth='xs' fullWidth>
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>{heading}</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity='error' sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <TextField
            autoFocus
            fullWidth
            label='Título da página'
            value={title}
            onChange={event => setTitle(event.target.value)}
            inputProps={{ maxLength: DOCUMENT_SITE_LIMITS.titleChars }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} color='secondary' disabled={saving}>
            Cancelar
          </Button>
          <Button type='submit' variant='contained' disabled={saving}>
            {saving ? 'Salvando...' : confirmLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

/** Mover para dentro de outra página (ou para a raiz): destinos inválidos aparecem desabilitados, com o motivo */
export const PageMoveDialog = ({ pages, page, onClose, onSubmit }) => {
  // undefined = nenhum destino escolhido; null = raiz do site
  const [selected, setSelected] = useState(undefined)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const options = useMemo(() => {
    const flat = []

    const walk = (nodes, depth) => {
      for (const node of nodes) {
        flat.push({ id: node.id, title: node.title, depth })
        walk(node.children, depth + 1)
      }
    }

    walk(buildSitePageTree(pages), 1)

    return [{ id: null, title: 'Início do site (raiz)', depth: 0 }, ...flat].map(option => {
      const isCurrent = (page.parentId ?? null) === option.id
      const plan = option.id === page.id ? { error: 'A própria página' } : planSitePageMove(pages, page.id, option.id)

      return { ...option, isCurrent, reason: isCurrent ? 'Local atual' : (plan.error ?? '') }
    })
  }, [pages, page])

  const handleSubmit = async () => {
    setSaving(true)
    setError('')

    const message = await onSubmit(selected)

    setSaving(false)
    if (message) setError(message)
  }

  return (
    <Dialog open onClose={saving ? undefined : onClose} maxWidth='xs' fullWidth>
      <DialogTitle>Mover “{page.title}”</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity='error' sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <DialogContentText sx={{ mb: 1 }}>
          Escolha onde a página fica. O site aceita até {DOCUMENT_SITE_LIMITS.maxDepth} níveis (atual: nível{' '}
          {getSitePageDepth(pages, page.id)}).
        </DialogContentText>
        <List dense disablePadding>
          {options.map(option => (
            <ListItemButton
              key={option.id ?? 'raiz'}
              disabled={!!option.reason}
              selected={selected !== undefined && selected === option.id}
              onClick={() => setSelected(option.id)}
              sx={{ paddingInlineStart: `${1 + option.depth * 1.25}rem`, borderRadius: 1 }}
            >
              <ListItemText
                primary={option.title}
                secondary={option.reason || undefined}
                primaryTypographyProps={{ noWrap: true }}
              />
            </ListItemButton>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color='secondary' disabled={saving}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} variant='contained' disabled={saving || selected === undefined}>
          {saving ? 'Movendo...' : 'Mover'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

/** Confirmação (excluir página) */
export const PageConfirmDialog = ({ heading, message, confirmLabel, onClose, onConfirm }) => {
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleConfirm = async () => {
    setSaving(true)
    setError('')

    const result = await onConfirm()

    setSaving(false)
    if (result) setError(result)
  }

  return (
    <Dialog open onClose={saving ? undefined : onClose} maxWidth='xs' fullWidth>
      <DialogTitle>{heading}</DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
        {error && (
          <Alert severity='error' sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color='secondary' disabled={saving}>
          Cancelar
        </Button>
        <Button onClick={handleConfirm} color='error' variant='contained' disabled={saving}>
          {saving ? 'Aguarde...' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
