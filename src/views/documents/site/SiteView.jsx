'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useParams, useRouter } from 'next/navigation'

import Breadcrumbs from '@mui/material/Breadcrumbs'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import { toast } from 'react-toastify'

import PreviewDialog from '../PreviewDialog'
import SiteBlocks from './SiteBlocks'
import SiteNavbar from './SiteNavbar'
import SitePageEditor from './SitePageEditor'
import { PageConfirmDialog, PageMoveDialog, PageTitleDialog } from './SitePageDialogs'
import SitePageTree from './SitePageTree'
import { DOCUMENT_SITE_TEXT } from '@/libs/documentFileTypes'
import {
  DOCUMENT_SITE_LIMITS,
  buildSitePagePath,
  buildSitePageTree,
  compareSitePages,
  getSitePageDepth
} from '@/libs/documentSite'
import { getLocalizedUrl } from '@/utils/i18n'
import { useSettings } from '@core/hooks/useSettings'
import { btnPrimary, formAlertErrorCls, formCardCls, formMutedCls } from '@/views/forms/formStyles'

const readPageIdFromUrl = () => new URLSearchParams(window.location.search).get('page')

const DISCARD_MESSAGE = 'Há alterações não salvas nesta página. Descartar e continuar?'

async function request(method, url, json) {
  try {
    const res = await fetch(url, {
      method,
      cache: 'no-store',
      ...(json !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(json) } : {})
    })

    return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) }
  } catch {
    return { ok: false, status: 0, body: { message: 'Erro de conexão' } }
  }
}

function downloadFile(file) {
  const link = document.createElement('a')

  link.href = `/api/documents/files/${file.id}/download`
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

/**
 * Site: barra de navegação no topo, conteúdo em largura total e, para quem pode editar, o modo de edição
 * (páginas e blocos). A página aberta fica em ?page=<id>, então o link pode ser compartilhado internamente.
 */
const SiteView = ({ siteId, initialPageId = null, maxFileSizeMb }) => {
  const { lang } = useParams()
  const router = useRouter()
  const { updatePageSettings } = useSettings()

  const [site, setSite] = useState(null)
  const [siteError, setSiteError] = useState('')
  const [siteLoading, setSiteLoading] = useState(true)
  const [pageId, setPageId] = useState(initialPageId)
  const [pageData, setPageData] = useState(null)
  const [pageFiles, setPageFiles] = useState({})
  const [pageError, setPageError] = useState(null)
  const [pageReload, setPageReload] = useState(0)
  const [editorEpoch, setEditorEpoch] = useState(0)
  const pageSeq = useRef(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [dialog, setDialog] = useState(null)
  const [previewFile, setPreviewFile] = useState(null)

  const baseUrl = getLocalizedUrl(`/documents/site/${siteId}`, lang)
  const pages = useMemo(() => site?.pages ?? [], [site])
  const tree = useMemo(() => buildSitePageTree(pages), [pages])

  // Página inválida na URL (removida ou de outro site) cai na página inicial
  const activePageId = pages.some(page => page.id === pageId) ? pageId : (site?.homePageId ?? null)
  const activePage = pages.find(page => page.id === activePageId) ?? null
  const pagePath = buildSitePagePath(pages, activePageId)

  // O conteúdo ocupa a largura toda (o layout limita a 1440px); a configuração volta ao normal ao sair da página
  useEffect(() => updatePageSettings({ contentWidth: 'wide' }), []) // eslint-disable-line react-hooks/exhaustive-deps

  // `initial`: primeira carga (mostra o carregando e o erro); sem ele a atualização é silenciosa (depois de uma ação).
  // O estado inicial já é "carregando", então o efeito não precisa alterar estado antes da resposta.
  const loadSite = useCallback(
    async ({ initial = false } = {}) => {
      const res = await request('GET', `/api/documents/sites/${siteId}`)

      if (res.ok) {
        setSite(res.body.data)
      } else if (initial) {
        setSiteError(
          res.status === 404 || res.status === 403 ? DOCUMENT_SITE_TEXT.notFound : res.body.message || 'Erro ao carregar'
        )
      }

      if (initial) setSiteLoading(false)
    },
    [siteId]
  )

  useEffect(() => {
    // Carga assíncrona: o estado só muda depois da resposta (a regra reclama do setState dentro da função chamada)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSite({ initial: true })
  }, [loadSite])

  const loadPage = useCallback(async () => {
    if (!activePageId) return

    // Resposta antiga (de uma página já deixada para trás) não sobrescreve a atual
    const seq = ++pageSeq.current
    const res = await request('GET', `/api/documents/sites/${siteId}/pages/${activePageId}?r=${pageReload}`)

    if (seq !== pageSeq.current) return

    if (!res.ok) {
      setPageError({ id: activePageId, message: res.body.message || 'Erro ao carregar a página' })

      // Página excluída por outra pessoa: atualiza o menu (a tela cai na página inicial)
      if (res.status === 404) loadSite()

      return
    }

    setPageError(null)
    setPageData(res.body.data)
    setPageFiles(res.body.files ?? {})

    // O editor recomeça do conteúdo recém-carregado (o salvamento não passa por aqui e não o reinicia)
    setEditorEpoch(count => count + 1)
  }, [siteId, activePageId, pageReload, loadSite])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPage()
  }, [loadPage])

  // Erro só vale para a página em que aconteceu; "carregando" é a página aberta ainda não estar carregada
  const pageErrorMessage = pageError?.id === activePageId ? pageError.message : ''
  const pageLoading = !pageErrorMessage && pageData?.id !== activePageId

  // Botão voltar/avançar do navegador: a página aberta vem da URL
  useEffect(() => {
    const handlePopState = () => {
      // Com alterações não salvas, voltar não pode descartá-las sem perguntar: se recusar, a URL volta à página atual
      if (editing && dirty) {
        if (!window.confirm(DISCARD_MESSAGE)) {
          window.history.pushState(null, '', `${baseUrl}?page=${activePageId}`)

          return
        }

        setDirty(false)
      }

      setPageId(readPageIdFromUrl())
    }

    window.addEventListener('popstate', handlePopState)

    return () => window.removeEventListener('popstate', handlePopState)
  }, [editing, dirty, baseUrl, activePageId])

  // Fechar ou recarregar a aba com alterações não salvas
  useEffect(() => {
    if (!dirty) return

    const handleBeforeUnload = event => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [dirty])

  // Links internos do sistema (menu lateral etc.) não disparam beforeunload: intercepta o clique antes do roteador
  useEffect(() => {
    if (!dirty) return

    const handleClick = event => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null

      if (!anchor || anchor.target === '_blank' || event.metaKey || event.ctrlKey || event.shiftKey) return

      const url = new URL(anchor.href, window.location.href)

      if (url.origin !== window.location.origin || url.pathname + url.search === window.location.pathname + window.location.search) return

      if (!window.confirm(DISCARD_MESSAGE)) {
        event.preventDefault()
        event.stopPropagation()
      } else {
        setDirty(false)
      }
    }

    document.addEventListener('click', handleClick, true)

    return () => document.removeEventListener('click', handleClick, true)
  }, [dirty])

  // true se pode seguir: sem alterações pendentes ou se o usuário aceitou descartá-las
  const confirmDiscard = () => {
    if (!editing || !dirty) return true
    if (!window.confirm(DISCARD_MESSAGE)) return false

    setDirty(false)

    return true
  }

  const goToPage = id => {
    setPageId(id)
    setMenuOpen(false)
    window.history.pushState(null, '', `${baseUrl}?page=${id}`)
  }

  const selectPage = id => {
    if (id === activePageId || !confirmDiscard()) return

    goToPage(id)
  }

  const goBack = () => {
    if (!confirmDiscard()) return

    router.push(getLocalizedUrl(site?.folderId ? `/documents?folder=${site.folderId}` : '/documents', lang))
  }

  const toggleEditing = () => {
    if (editing) {
      if (!confirmDiscard()) return

      setEditing(false)
      setPageReload(count => count + 1)

      return
    }

    setEditing(true)
  }

  // ── Gerenciar páginas (modo de edição) ────

  const pagesUrl = `/api/documents/sites/${siteId}/pages`

  const createPage = async (title, parentId) => {
    const res = await request('POST', pagesUrl, { title, parentId })

    if (!res.ok) return res.body.message || 'Erro ao criar a página'

    setDialog(null)
    await loadSite({ silent: true })

    // As alterações pendentes da página atual só são descartadas se o usuário confirmar
    if (confirmDiscard()) goToPage(res.body.data.id)

    toast.success('Página criada!')

    return ''
  }

  const renamePage = async title => {
    const res = await request('PATCH', `${pagesUrl}/${activePageId}`, { title })

    if (!res.ok) return res.body.message || 'Erro ao renomear a página'

    setDialog(null)
    await loadSite({ silent: true })
    setPageData(current => (current && current.id === activePageId ? { ...current, title } : current))
    toast.success('Página renomeada!')

    return ''
  }

  const movePage = async (parentId, index) => {
    const res = await request('POST', `${pagesUrl}/${activePageId}/move`, { parentId, index })

    if (!res.ok) return res.body.message || 'Erro ao mover a página'

    setDialog(null)
    setSite(current => ({ ...current, pages: res.body.data.pages, homePageId: res.body.data.homePageId }))

    return ''
  }

  const deletePage = async () => {
    const res = await request('DELETE', `${pagesUrl}/${activePageId}`)

    if (!res.ok) return res.body.message || 'Erro ao excluir a página'

    const fallback = activePage?.parentId ?? site.homePageId

    setDialog(null)
    setDirty(false)
    await loadSite({ silent: true })
    goToPage(fallback)
    toast.success('Página excluída!')

    return ''
  }

  const siblings = activePage
    ? pages.filter(page => (page.parentId ?? null) === (activePage.parentId ?? null)).sort(compareSitePages)
    : []

  const siblingIndex = siblings.findIndex(page => page.id === activePageId)
  const isHome = activePageId === site?.homePageId
  const canAddChild = activePage ? getSitePageDepth(pages, activePageId) < DOCUMENT_SITE_LIMITS.maxDepth : false

  const shiftPage = async direction => {
    const message = await movePage(activePage.parentId ?? null, siblingIndex + direction)

    if (message) toast.error(message)
  }

  // ── Telas de carregamento e erro ──────────

  if (siteLoading && !site) {
    return (
      <div className='flex justify-center py-16'>
        <CircularProgress aria-label='Carregando' />
      </div>
    )
  }

  if (!site) {
    return (
      <div>
        <div className={`${formAlertErrorCls} mb-4`} role='alert'>
          {siteError || DOCUMENT_SITE_TEXT.notFound}
        </div>
        <button type='button' onClick={() => router.push(getLocalizedUrl('/documents', lang))} className={btnPrimary}>
          <i className='tabler-arrow-left text-base' />
          {DOCUMENT_SITE_TEXT.backToFolder}
        </button>
      </div>
    )
  }

  const canEdit = !!site.permissions?.canEdit

  const menu = <SitePageTree pages={pages} selectedId={activePageId} onSelect={selectPage} label={`Páginas de ${site.name}`} />

  const editAction = canEdit && (
    <Button
      size='small'
      variant={editing ? 'contained' : 'outlined'}
      onClick={toggleEditing}
      startIcon={<i className={editing ? 'tabler-check' : 'tabler-pencil'} />}
    >
      {editing ? 'Concluir edição' : 'Editar'}
    </Button>
  )

  return (
    <div className={`${formCardCls} flex flex-col overflow-hidden min-h-[calc(100dvh-9rem)]`}>
      <SiteNavbar
        siteName={site.name}
        tree={tree}
        selectedId={activePageId}
        activeRootId={pagePath[0]?.id}
        onSelect={selectPage}
        onBack={goBack}
        onOpenMenu={() => setMenuOpen(true)}
        actions={editAction}
      />

      {editing && activePage && (
        <div
          role='toolbar'
          aria-label='Gerenciar páginas'
          className='flex flex-wrap items-center gap-2 px-3 sm:px-5 py-2 border-b border-[var(--mui-palette-divider)] bg-[var(--mui-palette-action-hover)]'
        >
          <Button
            size='small'
            variant='outlined'
            startIcon={<i className='tabler-file-plus' />}
            disabled={pages.length >= DOCUMENT_SITE_LIMITS.maxPages}
            onClick={() => setDialog({ type: 'create', parentId: null })}
          >
            Nova página
          </Button>
          <Button
            size='small'
            variant='outlined'
            startIcon={<i className='tabler-subtask' />}
            disabled={!canAddChild || pages.length >= DOCUMENT_SITE_LIMITS.maxPages}
            onClick={() => setDialog({ type: 'create', parentId: activePageId })}
          >
            Nova subpágina
          </Button>
          <span className='w-px self-stretch bg-[var(--mui-palette-divider)]' aria-hidden />
          <Button size='small' variant='outlined' startIcon={<i className='tabler-edit' />} onClick={() => setDialog({ type: 'rename' })}>
            Renomear
          </Button>
          <Button size='small' variant='outlined' startIcon={<i className='tabler-folder-share' />} onClick={() => setDialog({ type: 'move' })}>
            Mover para…
          </Button>
          <Tooltip title='Subir a página'>
            <span>
              <IconButton size='small' aria-label='Subir a página' disabled={siblingIndex <= 0} onClick={() => shiftPage(-1)}>
                <i className='tabler-arrow-up' />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title='Descer a página'>
            <span>
              <IconButton
                size='small'
                aria-label='Descer a página'
                disabled={siblingIndex < 0 || siblingIndex >= siblings.length - 1}
                onClick={() => shiftPage(1)}
              >
                <i className='tabler-arrow-down' />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={isHome ? 'A página inicial não pode ser excluída' : 'Excluir a página'}>
            <span>
              <Button
                size='small'
                color='error'
                variant='outlined'
                disabled={isHome}
                startIcon={<i className='tabler-trash' />}
                onClick={() => setDialog({ type: 'delete' })}
              >
                Excluir
              </Button>
            </span>
          </Tooltip>
          <span className={`text-xs ${formMutedCls} ms-auto`}>
            {pages.length} de {DOCUMENT_SITE_LIMITS.maxPages} páginas
          </span>
        </div>
      )}

      <main className='flex-1 min-w-0 p-5 sm:p-8'>
        <Breadcrumbs separator={<i className='tabler-chevron-right text-sm' />} className='mb-4 min-w-0'>
          {[{ id: null, title: site.name }, ...pagePath].map((crumb, index, all) =>
            index === all.length - 1 ? (
              <span
                key={crumb.id ?? 'site'}
                title={crumb.title}
                aria-current='page'
                className='block max-w-[240px] truncate font-medium text-[var(--mui-palette-text-primary)]'
              >
                {crumb.title}
              </span>
            ) : (
              <button
                key={crumb.id ?? 'site'}
                type='button'
                title={crumb.title}
                onClick={() => selectPage(crumb.id ?? site.homePageId)}
                className={`block max-w-[240px] truncate cursor-pointer bg-transparent border-0 p-0 ${formMutedCls} hover:text-[var(--mui-palette-primary-main)] hover:underline`}
              >
                {crumb.title}
              </button>
            )
          )}
        </Breadcrumbs>

        {pageErrorMessage && (
          <div className={formAlertErrorCls} role='alert'>
            {pageErrorMessage}
          </div>
        )}

        {pageLoading && (
          <div className='flex justify-center py-10'>
            <CircularProgress size={28} aria-label='Carregando página' />
          </div>
        )}

        {!pageErrorMessage && pageData && pageData.id === activePageId && (
          <>
            <h1 className='mbe-6 text-3xl font-semibold text-[var(--mui-palette-text-primary)]'>{pageData.title}</h1>

            {editing && canEdit ? (
              <SitePageEditor
                key={`${pageData.id}:${editorEpoch}`}
                site={site}
                page={pageData}
                files={pageFiles}
                canUpload={!!site.permissions?.canCreate}
                maxFileSizeMb={maxFileSizeMb}
                onDirtyChange={setDirty}
                onSaved={(data, files) => {
                  setPageData(data)
                  setPageFiles(current => ({ ...current, ...files }))
                }}
                onConflict={reason => {
                  setDirty(false)

                  if (reason === 'deleted') {
                    toast.error('Esta página foi excluída por outra pessoa.')
                    loadSite({ silent: true }).then(() => goToPage(site.homePageId))

                    return
                  }

                  setPageReload(count => count + 1)
                }}
              />
            ) : (
              <SiteBlocks
                blocks={pageData.content}
                files={pageFiles}
                onOpenFile={setPreviewFile}
                emptyText={DOCUMENT_SITE_TEXT.emptyPage}
              />
            )}
          </>
        )}
      </main>

      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} PaperProps={{ sx: { width: 300, p: 2 } }}>
        <h6 className='mbe-3 text-base font-semibold'>{site.name}</h6>
        {menu}
      </Drawer>

      <PreviewDialog file={previewFile} onClose={() => setPreviewFile(null)} onDownload={downloadFile} />

      {dialog?.type === 'create' && (
        <PageTitleDialog
          heading={dialog.parentId ? 'Nova subpágina' : 'Nova página'}
          confirmLabel='Criar'
          onClose={() => setDialog(null)}
          onSubmit={title => createPage(title, dialog.parentId)}
        />
      )}

      {dialog?.type === 'rename' && activePage && (
        <PageTitleDialog
          heading='Renomear página'
          initialTitle={activePage.title}
          confirmLabel='Renomear'
          onClose={() => setDialog(null)}
          onSubmit={renamePage}
        />
      )}

      {dialog?.type === 'move' && activePage && (
        <PageMoveDialog
          pages={pages}
          page={activePage}
          onClose={() => setDialog(null)}
          onSubmit={parentId => movePage(parentId, undefined)}
        />
      )}

      {dialog?.type === 'delete' && activePage && (
        <PageConfirmDialog
          heading='Excluir página'
          message={`Excluir “${activePage.title}” e todas as suas subpáginas? Esta ação não pode ser desfeita.`}
          confirmLabel='Excluir'
          onClose={() => setDialog(null)}
          onConfirm={deletePage}
        />
      )}
    </div>
  )
}

export default SiteView
