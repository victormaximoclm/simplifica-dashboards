'use client'

import { useEffect, useState } from 'react'

import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'

import FilePreviewContent from './FilePreviewContent'
import ClientPdfViewer from '@/components/pdf-viewer/ClientPdfViewer'
import { formAlertErrorCls, formDividerCls, formMutedCls } from '@/views/forms/formStyles'

/**
 * Somente visualização: nenhum visualizador traz botão de baixar/imprimir (o download é o botão "Baixar").
 * PDF e imagens: conteúdo de /preview, PDF desenhado pelo visualizador do sistema (pdf.js).
 * Demais tipos (txt, csv, docx, xlsx, pptx, zip): dados estruturados de /preview-data.
 */
const PreviewDialog = ({ file, onClose, onDownload, onEdit }) => {
  const [fetched, setFetched] = useState({ fileId: null, loading: false, error: '', data: null })

  // Ignora resultado de um arquivo aberto anteriormente até o novo carregar
  const state = fetched.fileId === file?.id ? fetched : { loading: true, error: '', data: null }
  const open = !!file
  const previewUrl = file ? `/api/documents/files/${file.id}/preview` : ''
  const isInline = !!file?.inlinePreview
  const isPdf = file?.mimeType === 'application/pdf'

  useEffect(() => {
    if (!file || file.inlinePreview) return

    const controller = new AbortController()

    setFetched({ fileId: file.id, loading: true, error: '', data: null })

    fetch(`/api/documents/files/${file.id}/preview-data`, { cache: 'no-store', signal: controller.signal })
      .then(async res => {
        const body = await res.json().catch(() => ({}))

        if (!res.ok) throw new Error(body.message || 'Não foi possível pré-visualizar o arquivo')
        setFetched({ fileId: file.id, loading: false, error: '', data: body })
      })
      .catch(error => {
        if (error.name !== 'AbortError')
          setFetched({ fileId: file.id, loading: false, error: error.message, data: null })
      })

    return () => controller.abort()
  }, [file])

  return (
    <Dialog open={open} onClose={onClose} maxWidth='lg' fullWidth>
      <DialogTitle className='flex items-center gap-2'>
        <span className='flex-1 min-w-0 truncate' title={file?.name}>
          {file?.name}
        </span>
        {onEdit && file?.htmlEditable && (
          <Button
            size='small'
            variant='tonal'
            startIcon={<i className='tabler-pencil' />}
            onClick={() => onEdit(file)}
            className='shrink-0'
          >
            Editar
          </Button>
        )}
        <Button
          size='small'
          variant='tonal'
          startIcon={<i className='tabler-download' />}
          onClick={() => onDownload(file)}
          className='shrink-0'
        >
          Baixar
        </Button>
        <IconButton size='small' onClick={onClose} aria-label='Fechar' className='shrink-0'>
          <i className='tabler-x' />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {file && isInline && isPdf && <ClientPdfViewer key={file.id} file={previewUrl} title={file.name} />}
        {file && isInline && !isPdf && (
          <div
            className={`flex justify-center items-center rounded-lg border ${formDividerCls} bg-[var(--mui-palette-action-hover)] p-4 min-h-[40vh]`}
            onContextMenu={event => event.preventDefault()}
          >
            <img
              src={previewUrl}
              alt={file.name}
              draggable={false}
              className='max-w-full max-h-[70vh] object-contain rounded shadow-md select-none'
            />
          </div>
        )}
        {file && !isInline && state.loading && (
          <div className='flex justify-center items-center min-h-[40vh]'>
            <CircularProgress />
          </div>
        )}
        {file && !isInline && state.error && (
          <div className='flex flex-col items-center gap-4 py-8'>
            <div className={formAlertErrorCls}>{state.error}</div>
            <Button variant='contained' startIcon={<i className='tabler-download' />} onClick={() => onDownload(file)}>
              Baixar arquivo
            </Button>
          </div>
        )}
        {file && !isInline && state.data && (
          <>
            <FilePreviewContent key={file.id} data={state.data} />
            {state.data.kind !== 'html' && (
              <p className={`text-xs ${formMutedCls} mbs-3`}>
                Pré-visualização simplificada: a formatação pode diferir do original. Use “Baixar” para abrir no
                aplicativo.
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default PreviewDialog
