'use client'

import { useEffect, useState } from 'react'

import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import { useDropzone } from 'react-dropzone'
import { toast } from 'react-toastify'

import AppReactDropzone from '@/libs/styles/AppReactDropzone'
import {
  DOCUMENT_ALLOWED_EXTENSIONS,
  formatFileSize,
  getDocumentFileType,
  getDropzoneAccept
} from '@/libs/documentFileTypes'
import { formErrorInlineCls, formMutedCls, formSuccessTextCls } from '@/views/forms/formStyles'

let queueSeq = 0

/** fetch não reporta progresso de envio; por isso XMLHttpRequest */
function uploadWithProgress({ file, workspaceId, folderId, onProgress }) {
  return new Promise(resolve => {
    const xhr = new XMLHttpRequest()
    const formData = new FormData()

    formData.append('workspaceId', workspaceId)
    if (folderId) formData.append('folderId', folderId)
    formData.append('files', file)

    xhr.open('POST', '/api/documents/files')

    xhr.upload.onprogress = event => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
    }

    xhr.onload = () => {
      let data = {}

      try {
        data = JSON.parse(xhr.responseText)
      } catch {
        data = {}
      }

      resolve({ ok: xhr.status >= 200 && xhr.status < 300, data })
    }

    xhr.onerror = () => resolve({ ok: false, data: { message: 'Erro de conexão' } })
    xhr.send(formData)
  })
}

const UploadDialog = ({ open, workspaceId, folderId, maxFileSizeMb, onClose, onUploaded }) => {
  const [queue, setQueue] = useState([])
  const [uploading, setUploading] = useState(false)

  const maxBytes = maxFileSizeMb * 1024 * 1024

  useEffect(() => {
    if (open) setQueue([])
  }, [open])

  const validateFile = file => {
    if (!getDocumentFileType(file.name)) return 'Tipo de arquivo não permitido'
    if (file.size > maxBytes) return `Excede o limite de ${maxFileSizeMb} MB`

    return ''
  }

  const addFiles = files => {
    const items = files.map(file => {
      const error = validateFile(file)

      return {
        id: ++queueSeq,
        file,
        status: error ? 'error' : 'pending',
        progress: 0,
        error
      }
    })

    setQueue(prev => [...prev, ...items])
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: getDropzoneAccept(),
    multiple: true,
    disabled: uploading,

    // Validação própria (mensagens em pt-BR): aceitos e rejeitados entram na fila
    onDrop: (acceptedFiles, fileRejections) => addFiles([...acceptedFiles, ...fileRejections.map(r => r.file)])
  })

  const updateItem = (id, changes) =>
    setQueue(prev => prev.map(item => (item.id === id ? { ...item, ...changes } : item)))

  const pendingItems = queue.filter(item => item.status === 'pending')

  const handleUpload = async () => {
    if (!pendingItems.length) return

    setUploading(true)

    let successCount = 0
    let errorCount = 0

    // Um arquivo por requisição: progresso individual e corpo sempre abaixo do limite do servidor
    for (const item of pendingItems) {
      updateItem(item.id, { status: 'uploading', progress: 0 })

      const result = await uploadWithProgress({
        file: item.file,
        workspaceId,
        folderId,
        onProgress: progress => updateItem(item.id, { progress })
      })

      if (result.ok) {
        successCount++
        updateItem(item.id, { status: 'done', progress: 100 })
      } else {
        errorCount++
        updateItem(item.id, { status: 'error', error: result.data?.message || 'Erro ao enviar' })
      }
    }

    setUploading(false)

    if (successCount) {
      toast.success(successCount === 1 ? 'Arquivo enviado!' : `${successCount} arquivos enviados!`)
      onUploaded()
    }

    if (errorCount) {
      toast.error(
        errorCount === 1 ? 'Um arquivo não pôde ser enviado' : `${errorCount} arquivos não puderam ser enviados`
      )
    } else if (successCount) {
      onClose()
    }
  }

  const handleClose = () => {
    if (uploading) return
    onClose()
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth='sm' fullWidth>
      <DialogTitle>Enviar arquivos</DialogTitle>
      <DialogContent>
        <AppReactDropzone>
          <div {...getRootProps({ className: 'dropzone !min-bs-[180px]' })}>
            <input {...getInputProps()} />
            <div className='flex flex-col items-center gap-2 text-center'>
              <i className='tabler-cloud-upload text-4xl text-[var(--mui-palette-primary-main)]' />
              <p className='font-medium'>
                {isDragActive ? 'Solte os arquivos aqui' : 'Arraste arquivos ou clique para selecionar'}
              </p>
              <p className={`text-xs ${formMutedCls}`}>
                Até {maxFileSizeMb} MB por arquivo · {DOCUMENT_ALLOWED_EXTENSIONS.map(ext => `.${ext}`).join(', ')}
              </p>
            </div>
          </div>
        </AppReactDropzone>

        {queue.length > 0 && (
          <ul className='flex flex-col gap-2 mbs-4 p-0 list-none'>
            {queue.map(item => (
              <li key={item.id} className='flex flex-col gap-1'>
                <div className='flex items-center gap-2'>
                  <i className={`${getDocumentFileType(item.file.name)?.icon ?? 'tabler-file'} text-xl shrink-0`} />
                  <span className='flex-1 truncate text-sm'>{item.file.name}</span>
                  <span className={`text-xs ${formMutedCls} shrink-0`}>{formatFileSize(item.file.size)}</span>
                  {item.status === 'done' && <i className={`tabler-circle-check ${formSuccessTextCls}`} />}
                  {(item.status === 'pending' || item.status === 'error') && (
                    <IconButton
                      size='small'
                      disabled={uploading}
                      onClick={() => setQueue(prev => prev.filter(entry => entry.id !== item.id))}
                      aria-label={`Remover ${item.file.name}`}
                    >
                      <i className='tabler-x text-base' />
                    </IconButton>
                  )}
                </div>
                {item.status === 'uploading' && <LinearProgress variant='determinate' value={item.progress} />}
                {item.status === 'error' && <span className={formErrorInlineCls}>{item.error}</span>}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color='secondary' disabled={uploading}>
          {queue.some(item => item.status === 'done') ? 'Fechar' : 'Cancelar'}
        </Button>
        <Button onClick={handleUpload} variant='contained' disabled={uploading || !pendingItems.length}>
          {uploading ? 'Enviando...' : `Enviar${pendingItems.length ? ` (${pendingItems.length})` : ''}`}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default UploadDialog
