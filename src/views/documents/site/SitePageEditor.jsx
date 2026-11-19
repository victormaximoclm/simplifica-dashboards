'use client'

import { useCallback, useState } from 'react'

import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import { EditorContent, useEditor } from '@tiptap/react'
import { toast } from 'react-toastify'

import { EditorToolbar, createRichTextExtensions, editorSx } from '../DocumentRichText'
import UploadDialog from '../UploadDialog'
import SiteFilePicker from './SiteFilePicker'
import { formatFileSize, getDocumentItemType } from '@/libs/documentFileTypes'
import { DOCUMENT_SITE_LIMITS, SITE_IMAGE_MIMES } from '@/libs/documentSite'
import { formDividerCls, formMutedCls } from '@/views/forms/formStyles'

const BLOCK_TYPES = {
  text: { label: 'Texto', icon: 'tabler-typography' },
  image: { label: 'Imagem', icon: 'tabler-photo' },
  file: { label: 'Arquivo', icon: 'tabler-file' },
  link: { label: 'Link', icon: 'tabler-link' }
}

const newBlockId = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

const EMPTY_BLOCKS = {
  text: () => ({ type: 'text', doc: { type: 'doc', content: [{ type: 'paragraph' }] } }),
  image: () => ({ type: 'image', fileId: '', alt: '', caption: '', width: 'md' }),
  file: () => ({ type: 'file', fileId: '', label: '', description: '' }),
  link: () => ({ type: 'link', url: '', label: '', description: '' })
}

// O editor dos blocos de texto cresce com o conteúdo (o do documento HTML ocupa a tela)
const blockEditorSx = { ...editorSx, '& .ProseMirror': { ...editorSx['& .ProseMirror'], minHeight: '7rem' } }

const TextBlockEditor = ({ block, onChange }) => {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: createRichTextExtensions('Escreva aqui o texto…'),
    content: block.doc,
    onUpdate: ({ editor: current }) => onChange(block.id, { doc: current.getJSON() })
  })

  return (
    <div className={`rounded-lg border ${formDividerCls} overflow-hidden`}>
      {editor && <EditorToolbar editor={editor} />}
      <div className='bg-white px-4 py-3 cursor-text' onClick={() => editor?.commands.focus()}>
        <Box sx={blockEditorSx}>
          <EditorContent editor={editor} />
        </Box>
      </div>
    </div>
  )
}

/** Arquivo escolhido (ou aviso) + botões de escolher do módulo / enviar novo */
const FileChooser = ({ block, file, imagesOnly, canUpload, onPick, onUpload }) => {
  const type = file?.available ? getDocumentItemType(file) : null

  return (
    <div className='flex flex-wrap items-center gap-3'>
      <div className={`flex items-center gap-2 min-w-0 flex-1 text-sm ${formMutedCls}`}>
        {file?.available ? (
          <>
            <i className={`${type?.icon ?? 'tabler-file'} text-2xl shrink-0 text-[var(--mui-palette-primary-main)]`} />
            <span className='truncate text-[var(--mui-palette-text-primary)]' title={file.name}>
              {file.name}
            </span>
            <span className='shrink-0'>{formatFileSize(file.size)}</span>
          </>
        ) : block.fileId ? (
          <span className='text-[var(--mui-palette-warning-main)]'>
            O arquivo escolhido não está mais disponível. Escolha outro.
          </span>
        ) : (
          <span>{imagesOnly ? 'Nenhuma imagem escolhida' : 'Nenhum arquivo escolhido'}</span>
        )}
      </div>
      <Button size='small' variant='outlined' onClick={onPick} startIcon={<i className='tabler-folder-search' />}>
        Escolher do módulo
      </Button>
      {canUpload && (
        <Button size='small' variant='outlined' onClick={onUpload} startIcon={<i className='tabler-upload' />}>
          Enviar novo
        </Button>
      )}
    </div>
  )
}

const BlockShell = ({ block, index, count, onMove, onRemove, children }) => {
  const meta = BLOCK_TYPES[block.type]

  return (
    <section
      aria-label={`${meta.label}, bloco ${index + 1} de ${count}`}
      className={`rounded-xl border ${formDividerCls} p-3 mbe-3`}
    >
      <div className='flex items-center gap-2 mbe-2'>
        <i className={`${meta.icon} text-lg text-[var(--mui-palette-primary-main)]`} />
        <span className='flex-1 text-sm font-medium text-[var(--mui-palette-text-primary)]'>{meta.label}</span>
        <Tooltip title='Subir bloco'>
          <span>
            <IconButton size='small' disabled={index === 0} onClick={() => onMove(block.id, -1)} aria-label='Subir bloco'>
              <i className='tabler-arrow-up' />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title='Descer bloco'>
          <span>
            <IconButton
              size='small'
              disabled={index === count - 1}
              onClick={() => onMove(block.id, 1)}
              aria-label='Descer bloco'
            >
              <i className='tabler-arrow-down' />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title='Remover bloco'>
          <IconButton size='small' onClick={() => onRemove(block.id)} aria-label='Remover bloco' color='error'>
            <i className='tabler-trash' />
          </IconButton>
        </Tooltip>
      </div>
      {children}
    </section>
  )
}

/**
 * Editor de blocos de uma página (texto, imagem, arquivo e link). Monte com `key` da página: o rascunho nasce do
 * conteúdo salvo. Só o conteúdo é enviado (com a versão lida); o título muda pelo "Renomear".
 * `dirty` é uma marca explícita de edição do usuário (o JSON do TipTap nunca é igual ao do servidor para comparar).
 */
const SitePageEditor = ({ site, page, files, canUpload, maxFileSizeMb, onSaved, onDirtyChange, onConflict }) => {
  const [blocks, setBlocks] = useState(page.content)
  const [fileMap, setFileMap] = useState(files)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [picker, setPicker] = useState(null)
  const [upload, setUpload] = useState(null)

  const markDirty = useCallback(() => {
    setDirty(true)
    onDirtyChange(true)
  }, [onDirtyChange])

  const updateBlock = useCallback(
    (id, patch) => {
      setBlocks(prev => prev.map(block => (block.id === id ? { ...block, ...patch } : block)))
      markDirty()
    },
    [markDirty]
  )

  const addBlock = type => {
    if (blocks.length >= DOCUMENT_SITE_LIMITS.maxBlocks) {
      toast.error(`A página pode ter no máximo ${DOCUMENT_SITE_LIMITS.maxBlocks} blocos`)

      return
    }

    setBlocks(prev => [...prev, { id: newBlockId(), ...EMPTY_BLOCKS[type]() }])
    markDirty()
  }

  const moveBlock = (id, direction) => {
    setBlocks(prev => {
      const index = prev.findIndex(block => block.id === id)
      const target = index + direction

      if (index < 0 || target < 0 || target >= prev.length) return prev

      const next = [...prev]

      ;[next[index], next[target]] = [next[target], next[index]]

      return next
    })
    markDirty()
  }

  const removeBlock = id => {
    setBlocks(prev => prev.filter(block => block.id !== id))
    markDirty()
  }

  const chooseFile = (blockId, file) => {
    setFileMap(prev => ({ ...prev, [file.id]: { ...file, available: true } }))
    updateBlock(blockId, { fileId: file.id })
  }

  const handleSave = async () => {
    const incomplete = blocks.find(block => (block.type === 'image' || block.type === 'file') && !block.fileId)
    const noUrl = blocks.find(block => block.type === 'link' && !block.url?.trim())

    if (incomplete || noUrl) {
      setError(
        incomplete
          ? 'Escolha um arquivo em todos os blocos de imagem e de arquivo, ou remova os que estão vazios.'
          : 'Preencha o endereço em todos os blocos de link, ou remova os que estão vazios.'
      )

      return
    }

    setSaving(true)
    setError('')

    try {
      const res = await fetch(`/api/documents/sites/${site.id}/pages/${page.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: blocks, baseVersion: page.version })
      })

      const body = await res.json().catch(() => ({}))

      if (res.status === 409) {
        setConflict(true)
        setError(body.message || 'Esta página foi alterada por outra pessoa.')

        return
      }

      if (res.status === 404) {
        onConflict('deleted')

        return
      }

      if (!res.ok) {
        setError(body.message || 'Erro ao salvar a página')

        return
      }

      // Passa a valer o que o servidor devolveu (conteúdo limpo e nova versão)
      setBlocks(body.data.content)
      setFileMap(prev => ({ ...prev, ...body.files }))
      setDirty(false)
      onDirtyChange(false)
      onSaved(body.data, body.files)
      toast.success('Página salva!')
    } catch {
      setError('Erro de conexão')
    } finally {
      setSaving(false)
    }
  }

  const renderBody = block => {
    if (block.type === 'text') return <TextBlockEditor block={block} onChange={updateBlock} />

    if (block.type === 'link') {
      return (
        <div className='flex flex-col gap-3'>
          <TextField
            size='small'
            label='Endereço (https://…)'
            value={block.url}
            onChange={event => updateBlock(block.id, { url: event.target.value })}
            inputProps={{ maxLength: 2048 }}
          />
          <TextField
            size='small'
            label='Título (opcional)'
            value={block.label}
            onChange={event => updateBlock(block.id, { label: event.target.value })}
            inputProps={{ maxLength: DOCUMENT_SITE_LIMITS.labelChars }}
          />
          <TextField
            size='small'
            label='Descrição (opcional)'
            value={block.description}
            onChange={event => updateBlock(block.id, { description: event.target.value })}
            inputProps={{ maxLength: DOCUMENT_SITE_LIMITS.captionChars }}
          />
        </div>
      )
    }

    const imagesOnly = block.type === 'image'
    const file = fileMap[block.fileId]

    return (
      <div className='flex flex-col gap-3'>
        <FileChooser
          block={block}
          file={file}
          imagesOnly={imagesOnly}
          canUpload={canUpload}
          onPick={() => setPicker({ blockId: block.id, imagesOnly })}
          onUpload={() => setUpload({ blockId: block.id, imagesOnly })}
        />

        {imagesOnly && file?.available && SITE_IMAGE_MIMES.includes(file.mimeType) && (
          <img
            src={`/api/documents/files/${file.id}/preview`}
            alt={block.alt}
            className='max-h-48 w-auto self-start rounded-lg'
          />
        )}

        {imagesOnly ? (
          <>
            <TextField
              size='small'
              label='Texto alternativo (descreva a imagem)'
              value={block.alt}
              onChange={event => updateBlock(block.id, { alt: event.target.value })}
              inputProps={{ maxLength: DOCUMENT_SITE_LIMITS.captionChars }}
            />
            <TextField
              size='small'
              label='Legenda (opcional)'
              value={block.caption}
              onChange={event => updateBlock(block.id, { caption: event.target.value })}
              inputProps={{ maxLength: DOCUMENT_SITE_LIMITS.captionChars }}
            />
            <TextField
              select
              size='small'
              label='Tamanho'
              value={block.width}
              onChange={event => updateBlock(block.id, { width: event.target.value })}
            >
              <MenuItem value='sm'>Pequena</MenuItem>
              <MenuItem value='md'>Média</MenuItem>
              <MenuItem value='full'>Largura total</MenuItem>
            </TextField>
          </>
        ) : (
          <>
            <TextField
              size='small'
              label='Título (opcional; por padrão, o nome do arquivo)'
              value={block.label}
              onChange={event => updateBlock(block.id, { label: event.target.value })}
              inputProps={{ maxLength: DOCUMENT_SITE_LIMITS.labelChars }}
            />
            <TextField
              size='small'
              label='Descrição (opcional)'
              value={block.description}
              onChange={event => updateBlock(block.id, { description: event.target.value })}
              inputProps={{ maxLength: DOCUMENT_SITE_LIMITS.captionChars }}
            />
          </>
        )}
      </div>
    )
  }

  return (
    <div>
      {error && (
        <Alert
          severity='error'
          sx={{ mb: 2 }}
          action={
            conflict ? (
              <Button color='inherit' size='small' onClick={() => onConflict('conflict')}>
                Recarregar
              </Button>
            ) : undefined
          }
        >
          {error}
        </Alert>
      )}

      {blocks.length === 0 && (
        <p className={`text-sm ${formMutedCls} mbe-3`}>
          Esta página está vazia. Adicione um bloco de texto, imagem, arquivo ou link.
        </p>
      )}

      {blocks.map((block, index) => (
        <BlockShell
          key={block.id}
          block={block}
          index={index}
          count={blocks.length}
          onMove={moveBlock}
          onRemove={removeBlock}
        >
          {renderBody(block)}
        </BlockShell>
      ))}

      <div className='flex flex-wrap items-center gap-2 mbs-4'>
        <span className={`text-sm ${formMutedCls}`}>Adicionar:</span>
        {Object.entries(BLOCK_TYPES).map(([type, meta]) => (
          <Button
            key={type}
            size='small'
            variant='outlined'
            onClick={() => addBlock(type)}
            startIcon={<i className={meta.icon} />}
          >
            {meta.label}
          </Button>
        ))}
        <div className='flex-1' />
        <Button variant='contained' onClick={handleSave} disabled={saving || !dirty || conflict}>
          {saving ? 'Salvando...' : 'Salvar página'}
        </Button>
      </div>

      {picker && (
        <SiteFilePicker
          workspaceId={site.workspaceId}
          imagesOnly={picker.imagesOnly}
          onClose={() => setPicker(null)}
          onSelect={file => {
            chooseFile(picker.blockId, file)
            setPicker(null)
          }}
        />
      )}

      <UploadDialog
        open={!!upload}
        workspaceId={site.workspaceId}
        folderId={site.folderId}
        maxFileSizeMb={maxFileSizeMb}
        imagesOnly={!!upload?.imagesOnly}
        single
        title={upload?.imagesOnly ? 'Enviar imagem' : 'Enviar arquivo'}
        conflictHint='Para usar o arquivo que já existe, feche e use “Escolher do módulo”.'
        onClose={() => setUpload(null)}
        onUploaded={created => {
          if (created[0] && upload) chooseFile(upload.blockId, created[0])
        }}
      />
    </div>
  )
}

export default SitePageEditor
