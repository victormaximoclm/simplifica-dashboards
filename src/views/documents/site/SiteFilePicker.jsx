'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Pagination from '@mui/material/Pagination'
import TextField from '@mui/material/TextField'

import { formatFileSize, getDocumentItemType } from '@/libs/documentFileTypes'
import { SITE_IMAGE_MIMES } from '@/libs/documentSite'

const PAGE_SIZE = 50

/**
 * Seletor de arquivo do módulo de Documentos (navega pelas pastas do workspace do Site).
 * Monte só quando for abrir (o estado começa limpo a cada abertura). `imagesOnly` deixa selecionáveis só PNG, JPG e
 * WebP; pastas continuam navegáveis e os demais arquivos aparecem desabilitados.
 */
const SiteFilePicker = ({ workspaceId, imagesOnly = false, onClose, onSelect }) => {
  const [folderId, setFolderId] = useState(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [listing, setListing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const seq = useRef(0)

  // Busca com debounce
  useEffect(() => {
    const timeout = setTimeout(() => {
      const next = search.trim()

      if (next !== query) {
        setQuery(next)
        setPage(1)
      }
    }, 300)

    return () => clearTimeout(timeout)
  }, [search, query])

  const load = useCallback(async () => {
    const current = ++seq.current
    const params = new URLSearchParams({ workspaceId, page: String(page), pageSize: String(PAGE_SIZE) })

    if (folderId) params.set('folderId', folderId)
    if (query) params.set('q', query)

    setLoading(true)
    setError('')

    try {
      const res = await fetch(`/api/documents?${params}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))

      if (current !== seq.current) return

      if (!res.ok) {
        setListing(null)
        setError(data.message || 'Erro ao carregar os documentos')

        return
      }

      setListing(data)
    } catch {
      if (current === seq.current) setError('Erro de conexão')
    } finally {
      if (current === seq.current) setLoading(false)
    }
  }, [workspaceId, folderId, page, query])

  useEffect(() => {
    load()
  }, [load])

  const navigate = target => {
    setFolderId(target)
    setPage(1)
    setSearch('')
    setQuery('')
  }

  const isSelectable = item =>
    item.kind === 'file' && !item.isSite && (!imagesOnly || SITE_IMAGE_MIMES.includes(item.mimeType))

  const items = listing?.data ?? []
  const ancestors = listing?.ancestors ?? []
  const totalPages = listing?.pagination?.totalPages ?? 1

  return (
    <Dialog open onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>{imagesOnly ? 'Escolher imagem do módulo' : 'Escolher arquivo do módulo'}</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          size='small'
          label='Buscar pelo nome'
          value={search}
          onChange={event => setSearch(event.target.value)}
          sx={{ mt: 1, mb: 2 }}
        />

        {!query && (
          <nav aria-label='Pasta atual' className='flex flex-wrap items-center gap-1 mb-2 text-sm'>
            {[{ id: null, name: 'Documentos' }, ...ancestors].map((crumb, index, all) => (
              <span key={crumb.id ?? 'root'} className='flex items-center gap-1'>
                {index > 0 && <i className='tabler-chevron-right text-xs' />}
                {index === all.length - 1 ? (
                  <span className='font-medium'>{crumb.name}</span>
                ) : (
                  <button
                    type='button'
                    onClick={() => navigate(crumb.id)}
                    className='cursor-pointer bg-transparent border-0 p-0 underline text-[var(--mui-palette-primary-main)]'
                  >
                    {crumb.name}
                  </button>
                )}
              </span>
            ))}
          </nav>
        )}

        {loading && !listing ? (
          <div className='flex justify-center py-8'>
            <CircularProgress size={28} aria-label='Carregando' />
          </div>
        ) : error ? (
          <p className='text-sm text-[var(--mui-palette-error-main)]'>{error}</p>
        ) : items.length === 0 ? (
          <p className='text-sm py-6 text-center'>{query ? 'Nenhum resultado.' : 'Esta pasta está vazia.'}</p>
        ) : (
          <ul className='list-none p-0 m-0 flex flex-col'>
            {items.map(item => {
              const selectable = isSelectable(item)
              const isFolder = item.kind === 'folder'
              const type = getDocumentItemType(item)

              return (
                <li key={`${item.kind}-${item.id}`}>
                  <button
                    type='button'
                    disabled={!isFolder && !selectable}
                    onClick={() => (isFolder ? navigate(item.id) : onSelect(item))}
                    className='flex items-center gap-3 w-full px-2 py-2 text-left rounded-lg cursor-pointer bg-transparent border-0 hover:bg-[var(--mui-palette-action-hover)] disabled:opacity-50 disabled:cursor-not-allowed'
                  >
                    <i className={`${isFolder ? 'tabler-folder' : (type?.icon ?? 'tabler-file')} text-xl shrink-0`} />
                    <span className='flex-1 min-w-0'>
                      <span className='block truncate text-sm font-medium'>{item.name}</span>
                      {item.location && (
                        <span className='block truncate text-xs opacity-70'>
                          {['Documentos', ...item.location.map(folder => folder.name)].join(' / ')}
                        </span>
                      )}
                    </span>
                    {!isFolder && <span className='text-xs opacity-70 shrink-0'>{formatFileSize(item.size)}</span>}
                    {isFolder && <i className='tabler-chevron-right text-base shrink-0' />}
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {totalPages > 1 && (
          <div className='flex justify-center mt-3'>
            <Pagination count={totalPages} page={page} onChange={(_, next) => setPage(next)} size='small' />
          </div>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color='secondary'>
          Cancelar
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default SiteFilePicker
