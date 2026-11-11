/**
 * Tipos de arquivo aceitos no módulo de Documentos.
 * Compartilhado entre client (validação/ícones) e servidor (validação/Content-Type) — sem imports de servidor aqui.
 *
 * `mime` é o Content-Type canônico gravado no banco e usado nas respostas (nunca o informado pelo browser).
 * `acceptedMimes` são os valores que browsers/sistemas costumam enviar para a extensão.
 */
export const DOCUMENT_FILE_TYPES = {
  pdf: { mime: 'application/pdf', acceptedMimes: ['application/pdf'], icon: 'tabler-file-type-pdf', label: 'PDF' },
  docx: {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    acceptedMimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    icon: 'tabler-file-type-docx',
    label: 'Word'
  },
  xlsx: {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    acceptedMimes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    icon: 'tabler-file-type-xls',
    label: 'Excel'
  },
  pptx: {
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    acceptedMimes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    icon: 'tabler-file-type-ppt',
    label: 'PowerPoint'
  },
  csv: {
    mime: 'text/csv',
    acceptedMimes: ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel'],
    icon: 'tabler-file-type-csv',
    label: 'CSV'
  },
  txt: { mime: 'text/plain', acceptedMimes: ['text/plain'], icon: 'tabler-file-type-txt', label: 'Texto' },
  png: { mime: 'image/png', acceptedMimes: ['image/png'], icon: 'tabler-photo', label: 'Imagem' },
  jpg: { mime: 'image/jpeg', acceptedMimes: ['image/jpeg', 'image/pjpeg'], icon: 'tabler-photo', label: 'Imagem' },
  jpeg: { mime: 'image/jpeg', acceptedMimes: ['image/jpeg', 'image/pjpeg'], icon: 'tabler-photo', label: 'Imagem' },
  webp: { mime: 'image/webp', acceptedMimes: ['image/webp'], icon: 'tabler-photo', label: 'Imagem' },
  zip: {
    mime: 'application/zip',
    acceptedMimes: ['application/zip', 'application/x-zip-compressed', 'application/x-zip'],
    icon: 'tabler-file-zip',
    label: 'ZIP'
  },

  // Gerado só pelo editor de documentos (template Simplifica); upload de HTML arbitrário não é aceito
  html: {
    mime: 'text/html',
    acceptedMimes: [],
    icon: 'tabler-file-type-html',
    label: 'Documento HTML',
    uploadable: false
  }
}

export const isUploadableFileType = fileType => !!fileType && fileType.uploadable !== false

export const DOCUMENT_ALLOWED_EXTENSIONS = Object.keys(DOCUMENT_FILE_TYPES).filter(ext =>
  isUploadableFileType(DOCUMENT_FILE_TYPES[ext])
)

export const HTML_DOCUMENT_MIME = DOCUMENT_FILE_TYPES.html.mime

/** Tipos que podem ser exibidos inline (preview) */
export const DOCUMENT_PREVIEWABLE_MIMES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']

export const DOCUMENT_DEFAULT_MAX_FILE_SIZE_MB = 25

export function getFileExtension(name) {
  const value = String(name || '')
  const dotIndex = value.lastIndexOf('.')

  if (dotIndex <= 0 || dotIndex === value.length - 1) return ''

  return value.slice(dotIndex + 1).toLowerCase()
}

export function getDocumentFileType(name) {
  return DOCUMENT_FILE_TYPES[getFileExtension(name)] ?? null
}

export function isPreviewableMime(mimeType) {
  return DOCUMENT_PREVIEWABLE_MIMES.includes(mimeType)
}

/** Objeto `accept` no formato do react-dropzone */
export function getDropzoneAccept() {
  return DOCUMENT_ALLOWED_EXTENSIONS.reduce((acc, ext) => {
    const type = DOCUMENT_FILE_TYPES[ext]

    acc[type.mime] = [...(acc[type.mime] ?? []), `.${ext}`]

    return acc
  }, {})
}

export function formatFileSize(bytes) {
  const value = Number(bytes) || 0

  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`

  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}
