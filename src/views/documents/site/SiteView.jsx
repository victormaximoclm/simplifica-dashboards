'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { useParams, useRouter } from 'next/navigation'

import Breadcrumbs from '@mui/material/Breadcrumbs'
import CircularProgress from '@mui/material/CircularProgress'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'

import SiteBlocks from './SiteBlocks'
import SitePageTree from './SitePageTree'
import { DOCUMENT_SITE_TEXT } from '@/libs/documentFileTypes'
import { buildSitePagePath } from '@/libs/documentSite'
import { getLocalizedUrl } from '@/utils/i18n'
import {
  btnPrimary,
  formAlertErrorCls,
  formCardCls,
  formMutedCls,
  formPageCls,
  formSubtitleCls,
  formTitleCls
} from '@/views/forms/formStyles'

const readPageIdFromUrl = () => new URLSearchParams(window.location.search).get('page')

/**
 * Visualização do Site: menu de páginas (árvore), breadcrumb e conteúdo da página aberta.
 * A página aberta fica em ?page=<id>, então o link pode ser compartilhado internamente.
 */
const SiteView = ({ siteId, initialPageId = null }) => {
  const { lang } = useParams()
  const router = useRouter()

  const [site, setSite] = useState(null)
  const [siteError, setSiteError] = useState('')
  const [siteLoading, setSiteLoading] = useState(true)
  const [pageId, setPageId] = useState(initialPageId)
  const [pageData, setPageData] = useState(null)
  const [pageError, setPageError] = useState('')
  const [pageLoading, setPageLoading] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const siteSeq = useRef(0)
  const pageSeq = useRef(0)

  const baseUrl = getLocalizedUrl(`/documents/site/${siteId}`, lang)
  const pages = site?.pages ?? []

  // Página inválida na URL (removida ou de outro site) cai na página inicial
  const activePageId = pages.some(page => page.id === pageId) ? pageId : (site?.homePageId ?? null)

  const loadSite = useCallback(async () => {
    const seq = ++siteSeq.current

    setSiteLoading(true)
    setSiteError('')

    try {
      const res = await fetch(`/api/documents/sites/${siteId}`, { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))

      if (seq !== siteSeq.current) return

      if (!res.ok) {
        setSite(null)
        setSiteError(res.status === 404 || res.status === 403 ? DOCUMENT_SITE_TEXT.notFound : body.message || 'Erro ao carregar')

        return
      }

      setSite(body.data)
    } catch {
      if (seq === siteSeq.current) setSiteError('Erro de conexão')
    } finally {
      if (seq === siteSeq.current) setSiteLoading(false)
    }
  }, [siteId])

  useEffect(() => {
    loadSite()
  }, [loadSite])

  const loadPage = useCallback(async () => {
    if (!activePageId) return

    const seq = ++pageSeq.current

    setPageLoading(true)
    setPageError('')

    try {
      const res = await fetch(`/api/documents/sites/${siteId}/pages/${activePageId}`, { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))

      if (seq !== pageSeq.current) return

      if (!res.ok) {
        setPageData(null)
        setPageError(body.message || 'Erro ao carregar a página')

        return
      }

      setPageData(body.data)
    } catch {
      if (seq === pageSeq.current) setPageError('Erro de conexão')
    } finally {
      if (seq === pageSeq.current) setPageLoading(false)
    }
  }, [siteId, activePageId])

  useEffect(() => {
    loadPage()
  }, [loadPage])

  // Botão voltar/avançar do navegador: a página aberta vem da URL
  useEffect(() => {
    const handlePopState = () => setPageId(readPageIdFromUrl())

    window.addEventListener('popstate', handlePopState)

    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const selectPage = id => {
    setPageId(id)
    setMenuOpen(false)
    window.history.pushState(null, '', `${baseUrl}?page=${id}`)
  }

  const backUrl = getLocalizedUrl(site?.folderId ? `/documents?folder=${site.folderId}` : '/documents', lang)
  const goBack = () => router.push(backUrl)

  if (siteLoading && !site) {
    return (
      <div className={`${formPageCls} flex justify-center py-16`}>
        <CircularProgress aria-label='Carregando' />
      </div>
    )
  }

  if (!site) {
    return (
      <div className={formPageCls}>
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

  const pagePath = buildSitePagePath(pages, activePageId)
  const location = ['Documentos', ...site.location.map(folder => folder.name)].join(' / ')

  const menu = (
    <SitePageTree pages={pages} selectedId={activePageId} onSelect={selectPage} label={`Páginas de ${site.name}`} />
  )

  return (
    <div className={formPageCls}>
      <div className='flex items-start justify-between gap-4 mb-4'>
        <div className='min-w-0'>
          <button
            type='button'
            onClick={goBack}
            className={`flex items-center gap-1 mb-2 text-sm cursor-pointer bg-transparent border-0 p-0 ${formMutedCls} hover:text-[var(--mui-palette-primary-main)]`}
          >
            <i className='tabler-arrow-left text-base' />
            {DOCUMENT_SITE_TEXT.backToFolder}
          </button>
          <h4 className={`${formTitleCls} truncate`}>{site.name}</h4>
          <p className={`${formSubtitleCls} mt-1 truncate`}>
            {location}
            {site.workspaceName ? ` · ${site.workspaceName}` : ''}
          </p>
        </div>
        <IconButton aria-label='Abrir menu de páginas' onClick={() => setMenuOpen(true)} className='md:hidden shrink-0'>
          <i className='tabler-menu-2' />
        </IconButton>
      </div>

      <div className='flex gap-6 items-start'>
        <aside className={`hidden md:block shrink-0 w-72 p-2 ${formCardCls}`}>{menu}</aside>

        <article className={`flex-1 min-w-0 p-6 ${formCardCls}`}>
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

          {pageError && (
            <div className={formAlertErrorCls} role='alert'>
              {pageError}
            </div>
          )}

          {!pageError && pageLoading && !pageData && (
            <div className='flex justify-center py-10'>
              <CircularProgress size={28} aria-label='Carregando página' />
            </div>
          )}

          {!pageError && pageData && pageData.id === activePageId && (
            <>
              <h1 className='mbe-6 text-3xl font-semibold text-[var(--mui-palette-text-primary)]'>{pageData.title}</h1>
              <SiteBlocks blocks={pageData.content} emptyText={DOCUMENT_SITE_TEXT.emptyPage} />
            </>
          )}
        </article>
      </div>

      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} PaperProps={{ sx: { width: 300, p: 2 } }}>
        <h6 className='mbe-3 text-base font-semibold text-[var(--mui-palette-text-primary)]'>{site.name}</h6>
        {menu}
      </Drawer>
    </div>
  )
}

export default SiteView
