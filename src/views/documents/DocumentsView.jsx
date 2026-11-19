'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { useParams, useRouter } from 'next/navigation'

import Breadcrumbs from '@mui/material/Breadcrumbs'
import CircularProgress from '@mui/material/CircularProgress'
import Pagination from '@mui/material/Pagination'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { useSession } from 'next-auth/react'
import { toast } from 'react-toastify'

import { DocumentItemsGrid, DocumentItemsTable } from './DocumentItems'
import DeleteDialog from './DeleteDialog'
import HtmlDocumentEditorDialog from './HtmlDocumentEditorDialog'
import HtmlTemplatesDialog from './HtmlTemplatesDialog'
import MoveDialog from './MoveDialog'
import NameDialog from './NameDialog'
import NewItemMenu from './NewItemMenu'
import NewSiteDialog from './NewSiteDialog'
import PreviewDialog from './PreviewDialog'
import UploadDialog from './UploadDialog'
import { DOCUMENT_SITE_TEXT } from '@/libs/documentFileTypes'
import { getLocalizedUrl } from '@/utils/i18n'
import {
  btnOutlined,
  formAlertErrorCls,
  formEmptyTitleCls,
  formIconMutedCls,
  formInputCls,
  formPageMutedCls,
  formPageCls,
  formSubtitleCls,
  formTitleCls
} from '@/views/forms/formStyles'

const VIEW_MODE_STORAGE_KEY = 'documentsViewMode'
const PAGE_SIZE = 50

function readStoredViewMode() {
  try {
    return localStorage.getItem(VIEW_MODE_STORAGE_KEY) === 'grid' ? 'grid' : 'list'
  } catch {
    return 'list'
  }
}

function storeViewMode(mode) {
  try {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode)
  } catch {
    // preferência é só conveniência; ignora storage indisponível
  }
}

/** Mesmo critério do VerticalMenu: localStorage e, na falta, cookie */
function getActiveWorkspaceId() {
  try {
    const fromStorage = localStorage.getItem('activeWorkspaceId')

    if (fromStorage) return fromStorage
  } catch {
    // segue para o cookie
  }

  const match = document.cookie.match(/(?:^|;\s*)activeWorkspaceId=([^;]*)/)

  return match ? decodeURIComponent(match[1]) : null
}

function downloadFile(file) {
  const link = document.createElement('a')

  link.href = `/api/documents/files/${file.id}/download`
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

const DocumentsView = ({ canCreate, canEdit, canDelete, maxFileSizeMb, sendActiveWorkspace, initialFolderId = null }) => {
  const { lang } = useParams()
  const router = useRouter()

  // `initialFolderId` vem de ?folder=<id> (o botão "voltar" do Site); id inválido cai na raiz pelo 404 do carregamento
  const [folderId, setFolderId] = useState(initialFolderId)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [viewMode, setViewMode] = useState('list')
  const [listing, setListing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [nameDialog, setNameDialog] = useState(null)
  const [moveItem, setMoveItem] = useState(null)
  const [deleteItem, setDeleteItem] = useState(null)
  const [previewFile, setPreviewFile] = useState(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [htmlEditor, setHtmlEditor] = useState(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [newSiteOpen, setNewSiteOpen] = useState(false)
  const { data: session } = useSession()
  const authorName = session?.user?.name || session?.user?.email
  const requestSeq = useRef(0)

  useEffect(() => {
    setViewMode(readStoredViewMode())
  }, [])

  // Busca com debounce
  useEffect(() => {
    const timeout = setTimeout(() => {
      const nextQuery = search.trim()

      if (nextQuery !== query) {
        setQuery(nextQuery)
        setPage(1)
      }
    }, 300)

    return () => clearTimeout(timeout)
  }, [search, query])

  const loadListing = useCallback(async () => {
    const seq = ++requestSeq.current
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
    const workspaceId = sendActiveWorkspace ? getActiveWorkspaceId() : null

    if (workspaceId) params.set('workspaceId', workspaceId)
    if (folderId) params.set('folderId', folderId)
    if (query) params.set('q', query)

    setLoading(true)
    setLoadError('')

    try {
      const res = await fetch(`/api/documents?${params}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))

      if (seq !== requestSeq.current) return

      if (!res.ok) {
        // Pasta removida/movida por outra pessoa: volta para a raiz
        if (res.status === 404 && folderId) {
          setFolderId(null)

          return
        }

        setListing(null)
        setLoadError(data.message || 'Erro ao carregar documentos')

        return
      }

      setListing(data)
    } catch {
      if (seq === requestSeq.current) setLoadError('Erro de conexão')
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [folderId, page, query, sendActiveWorkspace])

  useEffect(() => {
    loadListing()
  }, [loadListing, reloadKey])

  // Após exclusões a página atual pode deixar de existir
  useEffect(() => {
    const totalPages = listing?.pagination?.totalPages

    if (totalPages && page > totalPages) setPage(totalPages)
  }, [listing, page])

  // Troca de workspace (WorkspaceSwitcher): volta para a raiz e recarrega
  useEffect(() => {
    const handleWorkspaceChanged = () => {
      setFolderId(null)
      setPage(1)
      setSearch('')
      setQuery('')
      setReloadKey(key => key + 1)
    }

    window.addEventListener('workspace-changed', handleWorkspaceChanged)

    return () => window.removeEventListener('workspace-changed', handleWorkspaceChanged)
  }, [])

  const reload = () => setReloadKey(key => key + 1)

  const navigateTo = targetFolderId => {
    setFolderId(targetFolderId)
    setPage(1)
    setSearch('')
    setQuery('')
  }

  const handleViewModeChange = (_, mode) => {
    if (!mode) return
    setViewMode(mode)
    storeViewMode(mode)
  }

  const handleSaved = message => {
    toast.success(message)
    setNameDialog(null)
    setMoveItem(null)
    setDeleteItem(null)
    setHtmlEditor(null)
    reload()
  }

  const editHtmlDocument = file => {
    setPreviewFile(null)
    setHtmlEditor({ mode: 'edit', file })
  }

  // Botões de escrita exigem o perfil (props) E o nível de acesso no workspace atual (API)
  const permissions = listing?.permissions ?? {}
  const allowCreate = canCreate && !!permissions.canCreate
  const allowEdit = canEdit && !!permissions.canEdit
  const allowDelete = canDelete && !!permissions.canDelete

  const items = listing?.data ?? []
  const pagination = listing?.pagination
  const ancestors = listing?.ancestors ?? []
  const workspaceId = listing?.workspace?.id ?? null

  const openSite = site => router.push(getLocalizedUrl(`/documents/site/${site.id}`, lang))

  // Pasta navega, Site abre na própria página e todo arquivo abre na pré-visualização; o download continua
  // disponível no diálogo e no menu
  const openItem = item => {
    if (item.kind === 'folder') navigateTo(item.id)
    else if (item.isSite) openSite(item)
    else setPreviewFile(item)
  }

  const getItemOptions = item => {
    const option = (text, icon, onClick, className = '') => ({ text, icon, onClick, className })
    const options = []

    if (item.kind === 'folder') {
      options.push(option('Abrir', 'tabler-folder-open', () => navigateTo(item.id)))
    } else if (item.isSite) {
      options.push(option(DOCUMENT_SITE_TEXT.openAction, 'tabler-world', () => openSite(item)))
    } else {
      options.push(option('Visualizar', 'tabler-eye', () => setPreviewFile(item)))
      options.push(option('Baixar', 'tabler-download', () => downloadFile(item)))
    }

    if (allowEdit) {
      options.push({ divider: true })
      if (item.htmlEditable) options.push(option('Editar documento', 'tabler-pencil', () => editHtmlDocument(item)))
      options.push(option('Renomear', 'tabler-edit', () => setNameDialog({ mode: 'rename', item })))
      options.push(option('Mover', 'tabler-folder-share', () => setMoveItem(item)))
    }

    if (allowDelete) {
      if (!allowEdit) options.push({ divider: true })
      options.push(option('Excluir', 'tabler-trash', () => setDeleteItem(item), 'text-[var(--mui-palette-error-main)]'))
    }

    return options
  }

  const total = pagination?.total ?? 0
  const currentFolderName = ancestors.length ? ancestors[ancestors.length - 1].name : 'Documentos'

  return (
    <>
      <div className={formPageCls}>
        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4'>
          <div className='min-w-0'>
            <h4 className={`${formTitleCls} truncate`}>{currentFolderName}</h4>
            <p className={`${formSubtitleCls} mt-1`}>
              {listing?.search
                ? `${total} ${total === 1 ? 'resultado' : 'resultados'} para "${listing.search.query}"`
                : `${total} ${total === 1 ? 'item' : 'itens'}`}
              {listing?.workspace?.name ? ` · ${listing.workspace.name}` : ''}
            </p>
          </div>
          {allowCreate && (
            <div className='flex flex-wrap items-center gap-2 shrink-0'>
              <NewItemMenu
                options={[
                  { text: 'Pasta', icon: 'tabler-folder-plus', onClick: () => setNameDialog({ mode: 'create' }) },
                  { text: 'Documento', icon: 'tabler-file-text', onClick: () => setHtmlEditor({ mode: 'create' }) },
                  { text: 'Site', icon: 'tabler-world', onClick: () => setNewSiteOpen(true) }
                ]}
              />
              <button type='button' onClick={() => setUploadOpen(true)} className={btnOutlined}>
                <i className='tabler-upload text-base' />
                Enviar arquivo
              </button>
              <button type='button' onClick={() => setTemplatesOpen(true)} className={btnOutlined}>
                <i className='tabler-template text-base' />
                Templates
              </button>
            </div>
          )}
        </div>

        {/* Na raiz o título já diz "Documentos": o caminho só aparece dentro de uma pasta */}
        {ancestors.length > 0 && (
        <Breadcrumbs separator={<i className='tabler-chevron-right text-sm' />} className='mb-4 min-w-0'>
          {[{ id: null, name: 'Documentos' }, ...ancestors].map((crumb, index, all) =>
            index === all.length - 1 ? (
              <span
                key={crumb.id ?? 'root'}
                title={crumb.name}
                className='block max-w-[240px] truncate font-medium text-[var(--page-fg)]'
              >
                {crumb.name}
              </span>
            ) : (
              <button
                key={crumb.id ?? 'root'}
                type='button'
                title={crumb.name}
                onClick={() => navigateTo(crumb.id)}
                className='block max-w-[180px] truncate bg-transparent border-0 p-0 cursor-pointer text-[var(--mui-palette-primary-main)] hover:underline'
              >
                {crumb.name}
              </button>
            )
          )}
        </Breadcrumbs>
        )}

        <div className='flex flex-col sm:flex-row sm:items-center gap-3 mb-4'>
          <div className='relative flex-1'>
            <i className={`tabler-search absolute left-3 top-1/2 -translate-y-1/2 ${formIconMutedCls}`} />
            <input
              type='search'
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={folderId ? 'Buscar nesta pasta e nas subpastas' : 'Buscar em todos os documentos'}
              className={`${formInputCls} pl-9`}
              aria-label='Buscar documentos'
            />
          </div>
          <ToggleButtonGroup
            sx={{ '& .MuiToggleButton-root': { color: 'var(--page-fg-soft) !important', borderColor: 'var(--page-border)' }, '& .Mui-selected': { color: 'var(--mui-palette-primary-main) !important' } }}
            exclusive
            size='small'
            value={viewMode}
            onChange={handleViewModeChange}
            aria-label='Modo de visualização'
          >
            <ToggleButton value='list' aria-label='Lista'>
              <i className='tabler-list text-xl' />
            </ToggleButton>
            <ToggleButton value='grid' aria-label='Grade'>
              <i className='tabler-layout-grid text-xl' />
            </ToggleButton>
          </ToggleButtonGroup>
        </div>

        {loadError && <div className={`${formAlertErrorCls} mb-4`}>{loadError}</div>}

        {loading && !listing ? (
          <div className='flex justify-center items-center min-h-[40vh]'>
            <CircularProgress />
          </div>
        ) : !loadError && items.length === 0 ? (
          <div className='flex flex-col items-center justify-center min-h-[40vh] gap-4'>
            <i className={`${query ? 'tabler-search-off' : 'tabler-folder-open'} text-6xl text-[var(--page-fg-soft)]`} />
            <h4 className={formEmptyTitleCls}>
              {query ? 'Nenhum resultado' : folderId ? 'Esta pasta está vazia' : 'Nenhum documento ainda'}
            </h4>
            <p className={`${formPageMutedCls} text-center max-w-md`}>
              {query
                ? folderId
                  ? `Nada encontrado para "${query}" nesta pasta nem nas subpastas.`
                  : `Nada encontrado para "${query}" nos documentos.`
                : allowCreate
                  ? 'Crie uma pasta, envie arquivos ou escreva um documento para começar.'
                  : 'Ainda não há documentos disponíveis aqui.'}
            </p>
          </div>
        ) : (
          items.length > 0 && (
            <div className={`relative transition-opacity ${loading ? 'opacity-60 pointer-events-none' : ''}`}>
              {viewMode === 'grid' ? (
                <DocumentItemsGrid
                  items={items}
                  onOpen={openItem}
                  onOpenLocation={navigateTo}
                  getOptions={getItemOptions}
                />
              ) : (
                <DocumentItemsTable
                  items={items}
                  onOpen={openItem}
                  onOpenLocation={navigateTo}
                  getOptions={getItemOptions}
                />
              )}
            </div>
          )
        )}

        {pagination?.totalPages > 1 && (
          <div className='flex justify-center mt-6'>
            <Pagination
              shape='rounded'
              color='primary'
              variant='tonal'
              count={pagination.totalPages}
              page={pagination.page}
              onChange={(_, nextPage) => setPage(nextPage)}
            />
          </div>
        )}
      </div>

      <NameDialog
        state={nameDialog}
        workspaceId={workspaceId}
        parentId={folderId}
        onClose={() => setNameDialog(null)}
        onSaved={handleSaved}
      />
      <NewSiteDialog
        open={newSiteOpen && allowCreate}
        workspaceId={workspaceId}
        parentId={folderId}
        onClose={() => setNewSiteOpen(false)}
        onCreated={result => {
          toast.success(DOCUMENT_SITE_TEXT.createdToast)
          setNewSiteOpen(false)
          router.push(getLocalizedUrl(`/documents/site/${result.data.id}`, lang))
        }}
      />
      <MoveDialog item={moveItem} workspaceId={workspaceId} onClose={() => setMoveItem(null)} onMoved={handleSaved} />
      <DeleteDialog item={deleteItem} onClose={() => setDeleteItem(null)} onDeleted={handleSaved} />
      <PreviewDialog
        file={previewFile}
        onClose={() => setPreviewFile(null)}
        onDownload={downloadFile}
        onEdit={allowEdit ? editHtmlDocument : undefined}
      />
      <HtmlDocumentEditorDialog
        state={htmlEditor}
        workspaceId={workspaceId}
        folderId={folderId}
        workspaceName={listing?.workspace?.name}
        authorName={authorName}
        onClose={() => setHtmlEditor(null)}
        onSaved={handleSaved}
      />
      <HtmlTemplatesDialog
        open={templatesOpen && allowCreate}
        workspaceId={workspaceId}
        workspaceName={listing?.workspace?.name}
        authorName={authorName}
        canEdit={allowEdit}
        canDelete={allowDelete}
        onClose={() => setTemplatesOpen(false)}
      />
      <UploadDialog
        open={uploadOpen}
        workspaceId={workspaceId}
        folderId={folderId}
        maxFileSizeMb={maxFileSizeMb}
        onClose={() => setUploadOpen(false)}
        onUploaded={reload}
      />
    </>
  )
}

export default DocumentsView
