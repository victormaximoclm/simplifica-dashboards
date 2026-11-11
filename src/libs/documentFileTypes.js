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

/**
 * Site: item do Drive sem blob (o conteúdo fica nas páginas, no banco). O tipo é identificado só pelo `mimeType`
 * — nunca pela extensão do nome. O identificador interno (`DOCUMENT_SITE_MIME`) é separado do texto exibido
 * (`DOCUMENT_SITE_LABEL`): para trocar o nome mostrado ao usuário basta mudar o rótulo, sem migration.
 */
export const DOCUMENT_SITE_MIME = 'application/vnd.simplifica.site'
export const DOCUMENT_SITE_ICON = 'tabler-world'

/** Todos os textos do Site exibidos ao usuário ficam aqui (nome provisório "Site"): a troca é só nesta constante */
export const DOCUMENT_SITE_TEXT = {
  label: 'Site',
  newLabel: 'Novo Site',
  createdToast: 'Site criado!',
  openAction: 'Abrir site',
  deleteTitle: 'Excluir site',
  deleteTarget: 'o site',
  deleteWarning: 'As páginas do site também serão excluídas.',
  backToFolder: 'Voltar à pasta',
  emptyPage: 'Esta página ainda não tem conteúdo.',
  notFound: 'Não encontramos este site. Ele pode ter sido excluído ou movido.'
}

export const DOCUMENT_SITE_LABEL = DOCUMENT_SITE_TEXT.label

export const isSiteMime = mimeType => mimeType === DOCUMENT_SITE_MIME

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

/** Ícone e rótulo de um item da listagem: o `mimeType` (Site) tem prioridade sobre a extensão do nome */
export function getDocumentItemType(item) {
  if (isSiteMime(item?.mimeType)) return { icon: DOCUMENT_SITE_ICON, label: DOCUMENT_SITE_LABEL }

  return getDocumentFileType(item?.name)
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
