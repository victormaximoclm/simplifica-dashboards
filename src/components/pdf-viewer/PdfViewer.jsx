'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import { Document, Page, pdfjs } from 'react-pdf'

import { formAlertErrorCls, formDividerCls, formMutedCls, formScrollCls } from '@/views/forms/formStyles'

// Worker servido pelo próprio app (sem CDN externo)
pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]
const MAX_FIT_WIDTH = 960
const PAGE_GAP = 16

const ToolbarButton = ({ icon, label, disabled = false, onClick }) => (
  <Tooltip title={label}>
    <span>
      <IconButton size='small' aria-label={label} disabled={disabled} onClick={onClick}>
        <i className={`${icon} text-lg`} />
      </IconButton>
    </span>
  </Tooltip>
)

/** Página só é desenhada perto da área visível; fora dela fica um espaço reservado do mesmo tamanho */
const LazyPage = ({ pageNumber, width, height, scrollRoot, registerPage }) => {
  const ref = useRef(null)
  const [visible, setVisible] = useState(pageNumber <= 2)

  useEffect(() => {
    const element = ref.current

    if (!element || !scrollRoot) return

    registerPage(pageNumber, element)

    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      root: scrollRoot,
      rootMargin: '1200px 0px'
    })

    observer.observe(element)

    return () => {
      observer.disconnect()
      registerPage(pageNumber, null)
    }
  }, [pageNumber, scrollRoot, registerPage])

  return (
    <div
      ref={ref}
      data-page={pageNumber}
      className='mx-auto bg-white shadow-md rounded-sm overflow-hidden'
      style={{ width, height }}
    >
      {visible && (
        <Page
          pageNumber={pageNumber}
          width={width}
          renderTextLayer={false}
          renderAnnotationLayer={false}
          loading={<div style={{ width, height }} />}
        />
      )}
    </div>
  )
}

/**
 * Visualizador de PDF no layout do sistema: somente leitura (sem baixar/imprimir; o download é uma ação à parte).
 * Use pelo wrapper `ClientPdfViewer` (carrega só no navegador).
 */
const PdfViewer = ({ file, title, className = 'h-[75vh]' }) => {
  const [scrollRoot, setScrollRoot] = useState(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [numPages, setNumPages] = useState(0)
  const [pageRatio, setPageRatio] = useState(Math.SQRT2)
  const [zoom, setZoom] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageInput, setPageInput] = useState('1')
  const [error, setError] = useState('')
  const pagesRef = useRef(new Map())

  const registerPage = useCallback((pageNumber, element) => {
    if (element) pagesRef.current.set(pageNumber, element)
    else pagesRef.current.delete(pageNumber)
  }, [])

  // Largura disponível (ajustar à largura = zoom 100%)
  useEffect(() => {
    if (!scrollRoot) return

    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width))

    observer.observe(scrollRoot)

    return () => observer.disconnect()
  }, [scrollRoot])

  const pageWidth = Math.max(200, Math.round(Math.min(containerWidth - 32, MAX_FIT_WIDTH) * zoom))
  const pageHeight = Math.round(pageWidth * pageRatio)

  // Página atual = a que ocupa o meio da área visível
  const handleScroll = () => {
    if (!scrollRoot || !numPages) return

    const middle = scrollRoot.scrollTop + scrollRoot.clientHeight / 2
    const page = Math.min(numPages, Math.max(1, Math.floor(middle / (pageHeight + PAGE_GAP)) + 1))

    if (page !== currentPage) {
      setCurrentPage(page)
      setPageInput(String(page))
    }
  }

  const goToPage = page => {
    const target = Math.min(numPages, Math.max(1, page))

    setCurrentPage(target)
    setPageInput(String(target))
    pagesRef.current.get(target)?.scrollIntoView({ block: 'start' })
  }

  const changeZoom = direction => {
    const index = ZOOM_STEPS.indexOf(zoom)

    setZoom(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, index + direction))])
  }

  // Mantém a página atual na tela ao mudar o zoom
  useEffect(() => {
    pagesRef.current.get(currentPage)?.scrollIntoView({ block: 'start' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom])

  const handleLoadSuccess = async pdf => {
    const firstPage = await pdf.getPage(1)
    const viewport = firstPage.getViewport({ scale: 1 })

    setPageRatio(viewport.height / viewport.width)
    setNumPages(pdf.numPages)
    setError('')
  }

  const documentOptions = useMemo(() => ({ isEvalSupported: false }), [])

  return (
    <div className={`flex flex-col rounded-lg border ${formDividerCls} overflow-hidden ${className}`}>
      <div
        className={`flex flex-wrap items-center justify-center gap-1 px-2 py-1 border-b ${formDividerCls} bg-[var(--mui-palette-background-paper)]`}
      >
        <ToolbarButton
          icon='tabler-chevron-up'
          label='Página anterior'
          disabled={!numPages || currentPage <= 1}
          onClick={() => goToPage(currentPage - 1)}
        />
        <form
          className={`flex items-center gap-1.5 text-sm ${formMutedCls}`}
          onSubmit={event => {
            event.preventDefault()
            goToPage(Number(pageInput) || currentPage)
          }}
        >
          <input
            value={pageInput}
            onChange={event => setPageInput(event.target.value.replace(/\D/g, ''))}
            onBlur={() => setPageInput(String(currentPage))}
            disabled={!numPages}
            inputMode='numeric'
            aria-label='Página atual'
            className={`w-10 text-center rounded border ${formDividerCls} bg-transparent py-0.5 text-[var(--mui-palette-text-primary)] outline-none focus:border-[var(--mui-palette-primary-main)]`}
          />
          <span>de {numPages || '–'}</span>
        </form>
        <ToolbarButton
          icon='tabler-chevron-down'
          label='Próxima página'
          disabled={!numPages || currentPage >= numPages}
          onClick={() => goToPage(currentPage + 1)}
        />
        <Divider orientation='vertical' flexItem sx={{ mx: 1, my: 1 }} />
        <ToolbarButton
          icon='tabler-zoom-out'
          label='Diminuir zoom'
          disabled={!numPages || zoom <= ZOOM_STEPS[0]}
          onClick={() => changeZoom(-1)}
        />
        <span className={`w-12 text-center text-sm ${formMutedCls}`}>{Math.round(zoom * 100)}%</span>
        <ToolbarButton
          icon='tabler-zoom-in'
          label='Aumentar zoom'
          disabled={!numPages || zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
          onClick={() => changeZoom(1)}
        />
        <ToolbarButton
          icon='tabler-arrows-horizontal'
          label='Ajustar à largura'
          disabled={!numPages || zoom === 1}
          onClick={() => setZoom(1)}
        />
      </div>

      <div
        ref={setScrollRoot}
        onScroll={handleScroll}
        onContextMenu={event => event.preventDefault()}
        className={`flex-1 min-h-0 overflow-auto bg-[var(--mui-palette-action-hover)] py-4 px-4 ${formScrollCls}`}
        aria-label={title ? `Documento ${title}` : 'Documento'}
      >
        {error ? (
          <div className='flex justify-center py-10'>
            <div className={formAlertErrorCls}>{error}</div>
          </div>
        ) : (
          containerWidth > 0 && (
            <Document
              file={file}
              options={documentOptions}
              onLoadSuccess={handleLoadSuccess}
              onLoadError={() => setError('Não foi possível exibir este PDF.')}
              onSourceError={() => setError('Não foi possível carregar este PDF.')}
              loading={
                <div className='flex justify-center items-center min-h-[40vh]'>
                  <CircularProgress />
                </div>
              }
              error={null}
              className='flex flex-col'
            >
              <div className='flex flex-col w-max min-w-full' style={{ gap: PAGE_GAP }}>
                {Array.from({ length: numPages }, (_, index) => (
                  <LazyPage
                    key={index + 1}
                    pageNumber={index + 1}
                    width={pageWidth}
                    height={pageHeight}
                    scrollRoot={scrollRoot}
                    registerPage={registerPage}
                  />
                ))}
              </div>
            </Document>
          )
        )}
      </div>
    </div>
  )
}

export default PdfViewer
