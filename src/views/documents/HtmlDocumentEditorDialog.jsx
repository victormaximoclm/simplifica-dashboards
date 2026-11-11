'use client'

import { useEffect, useMemo, useState } from 'react'

import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Tooltip from '@mui/material/Tooltip'
import useMediaQuery from '@mui/material/useMediaQuery'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { TextAlign } from '@tiptap/extension-text-align'
import { Placeholder } from '@tiptap/extension-placeholder'

import { HtmlPreview } from './FilePreviewContent'
import { HTML_DOCUMENT_LIMITS, isHtmlDocumentEmpty, renderHtmlDocument, sanitizeLinkHref } from '@/libs/documentHtml'
import { formDividerCls, formMutedCls } from '@/views/forms/formStyles'

// Área de escrita em "papel" claro, com a mesma tipografia do template, para o usuário ver o resultado enquanto escreve
const editorSx = {
  '& .ProseMirror': {
    minHeight: '45vh',
    outline: 'none',
    color: '#1f2937',
    fontSize: 16,
    lineHeight: 1.65,
    overflowWrap: 'anywhere'
  },
  '& .ProseMirror > * + *': { marginTop: '0.75em' },
  '& .ProseMirror h1': { fontSize: 23, fontWeight: 700, lineHeight: 1.3, color: '#111827', mt: 3 },
  '& .ProseMirror h2': { fontSize: 19, fontWeight: 700, lineHeight: 1.35, color: '#111827', mt: 2.5 },
  '& .ProseMirror h3': {
    fontSize: 16,
    fontWeight: 700,
    color: '#111827',
    textTransform: 'uppercase',
    letterSpacing: '.04em',
    mt: 2
  },
  '& .ProseMirror ul': { listStyle: 'disc', paddingLeft: '26px' },
  '& .ProseMirror ol': { listStyle: 'decimal', paddingLeft: '26px' },
  '& .ProseMirror li > p': { margin: 0 },
  '& .ProseMirror blockquote': {
    borderLeft: '4px solid #E66C37',
    background: '#fdf3ee',
    borderRadius: '0 8px 8px 0',
    padding: '10px 18px',
    color: '#374151'
  },
  '& .ProseMirror a': { color: '#c2531f', textDecoration: 'underline' },
  '& .ProseMirror code': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: '0.9em',
    background: '#f3f4f6',
    padding: '1px 5px',
    borderRadius: '4px'
  },
  '& .ProseMirror pre': { background: '#1f2937', color: '#f9fafb', padding: '14px 18px', borderRadius: '8px' },
  '& .ProseMirror pre code': { background: 'none', padding: 0, color: 'inherit' },
  '& .ProseMirror hr': { border: 0, borderTop: '1px solid #e5e7eb', margin: '28px 0' },
  '& .ProseMirror p.is-editor-empty:first-of-type::before': {
    content: 'attr(data-placeholder)',
    float: 'left',
    color: '#9ca3af',
    pointerEvents: 'none',
    height: 0
  }
}

const ToolbarButton = ({ icon, label, active = false, disabled = false, onClick }) => (
  <Tooltip title={label}>
    <span>
      <IconButton
        size='small'
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onMouseDown={event => event.preventDefault()}
        onClick={onClick}
        color={active ? 'primary' : 'default'}
        sx={active ? { bgcolor: 'var(--mui-palette-primary-lightOpacity)' } : undefined}
      >
        <i className={`${icon} text-lg`} />
      </IconButton>
    </span>
  </Tooltip>
)

const ToolbarDivider = () => <Divider orientation='vertical' flexItem sx={{ mx: 0.5, my: 1 }} />

const EditorToolbar = ({ editor }) => {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive('bold'),
      italic: current.isActive('italic'),
      underline: current.isActive('underline'),
      strike: current.isActive('strike'),
      h1: current.isActive('heading', { level: 1 }),
      h2: current.isActive('heading', { level: 2 }),
      h3: current.isActive('heading', { level: 3 }),
      bulletList: current.isActive('bulletList'),
      orderedList: current.isActive('orderedList'),
      blockquote: current.isActive('blockquote'),
      link: current.isActive('link'),
      alignCenter: current.isActive({ textAlign: 'center' }),
      alignRight: current.isActive({ textAlign: 'right' }),
      alignJustify: current.isActive({ textAlign: 'justify' }),
      canUndo: current.can().undo(),
      canRedo: current.can().redo()
    })
  })

  const chain = () => editor.chain().focus()

  const handleLink = () => {
    if (state.link) {
      chain().extendMarkRange('link').unsetLink().run()

      return
    }

    const input = window.prompt('Endereço do link (https://...)')

    if (!input) return

    const value = input.trim()
    const href = sanitizeLinkHref(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`)

    if (!href) {
      window.alert('Use um endereço que comece com https://, http:// ou mailto:')

      return
    }

    chain().extendMarkRange('link').setLink({ href }).run()
  }

  return (
    <div className={`flex flex-wrap items-center gap-0.5 px-2 py-1 border-b ${formDividerCls}`}>
      <ToolbarButton
        icon='tabler-h-1'
        label='Título'
        active={state.h1}
        onClick={() => chain().toggleHeading({ level: 1 }).run()}
      />
      <ToolbarButton
        icon='tabler-h-2'
        label='Subtítulo'
        active={state.h2}
        onClick={() => chain().toggleHeading({ level: 2 }).run()}
      />
      <ToolbarButton
        icon='tabler-h-3'
        label='Seção'
        active={state.h3}
        onClick={() => chain().toggleHeading({ level: 3 }).run()}
      />
      <ToolbarDivider />
      <ToolbarButton
        icon='tabler-bold'
        label='Negrito'
        active={state.bold}
        onClick={() => chain().toggleBold().run()}
      />
      <ToolbarButton
        icon='tabler-italic'
        label='Itálico'
        active={state.italic}
        onClick={() => chain().toggleItalic().run()}
      />
      <ToolbarButton
        icon='tabler-underline'
        label='Sublinhado'
        active={state.underline}
        onClick={() => chain().toggleUnderline().run()}
      />
      <ToolbarButton
        icon='tabler-strikethrough'
        label='Tachado'
        active={state.strike}
        onClick={() => chain().toggleStrike().run()}
      />
      <ToolbarButton
        icon={state.link ? 'tabler-link-off' : 'tabler-link'}
        label={state.link ? 'Remover link' : 'Link'}
        active={state.link}
        onClick={handleLink}
      />
      <ToolbarDivider />
      <ToolbarButton
        icon='tabler-list'
        label='Lista'
        active={state.bulletList}
        onClick={() => chain().toggleBulletList().run()}
      />
      <ToolbarButton
        icon='tabler-list-numbers'
        label='Lista numerada'
        active={state.orderedList}
        onClick={() => chain().toggleOrderedList().run()}
      />
      <ToolbarButton
        icon='tabler-blockquote'
        label='Destaque'
        active={state.blockquote}
        onClick={() => chain().toggleBlockquote().run()}
      />
      <ToolbarButton
        icon='tabler-separator-horizontal'
        label='Linha divisória'
        onClick={() => chain().setHorizontalRule().run()}
      />
      <ToolbarDivider />
      <ToolbarButton
        icon='tabler-align-left'
        label='Alinhar à esquerda'
        active={!state.alignCenter && !state.alignRight && !state.alignJustify}
        onClick={() => chain().unsetTextAlign().run()}
      />
      <ToolbarButton
        icon='tabler-align-center'
        label='Centralizar'
        active={state.alignCenter}
        onClick={() => chain().setTextAlign('center').run()}
      />
      <ToolbarButton
        icon='tabler-align-right'
        label='Alinhar à direita'
        active={state.alignRight}
        onClick={() => chain().setTextAlign('right').run()}
      />
      <ToolbarButton
        icon='tabler-align-justified'
        label='Justificar'
        active={state.alignJustify}
        onClick={() => chain().setTextAlign('justify').run()}
      />
      <ToolbarDivider />
      <ToolbarButton
        icon='tabler-clear-formatting'
        label='Limpar formatação'
        onClick={() => chain().unsetAllMarks().clearNodes().run()}
      />
      <ToolbarButton
        icon='tabler-arrow-back-up'
        label='Desfazer'
        disabled={!state.canUndo}
        onClick={() => chain().undo().run()}
      />
      <ToolbarButton
        icon='tabler-arrow-forward-up'
        label='Refazer'
        disabled={!state.canRedo}
        onClick={() => chain().redo().run()}
      />
    </div>
  )
}

/**
 * Criar (state.mode 'create') ou editar (state.mode 'edit', state.file) um documento HTML.
 * O usuário só escreve; o servidor monta o .html com o template Simplifica.
 */
const HtmlDocumentEditorDialog = ({ state, workspaceId, folderId, workspaceName, authorName, onClose, onSaved }) => {
  const fullScreen = useMediaQuery(theme => theme.breakpoints.down('md'))
  const [title, setTitle] = useState('')
  const [templates, setTemplates] = useState([])
  const [templateId, setTemplateId] = useState('')
  const [tab, setTab] = useState('edit')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [previewContent, setPreviewContent] = useState(null)

  const open = !!state
  const isEdit = state?.mode === 'edit'
  const fileId = isEdit ? state.file.id : null

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https', protocols: ['http', 'https', 'mailto'] }
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: 'Escreva aqui o conteúdo do documento…' })
    ],
    onUpdate: () => setDirty(true)
  })

  // Abre limpo (novo) ou carrega o conteúdo salvo (edição)
  useEffect(() => {
    if (!state || !editor) return

    setTab('edit')
    setError('')
    setDirty(false)

    setTemplateId('')

    if (state.mode !== 'edit') {
      setTitle('')
      editor.commands.setContent('', { emitUpdate: false })

      return
    }

    const controller = new AbortController()

    setLoading(true)
    setTitle('')
    editor.commands.setContent('', { emitUpdate: false })

    fetch(`/api/documents/html/${state.file.id}`, { cache: 'no-store', signal: controller.signal })
      .then(async res => {
        const body = await res.json().catch(() => ({}))

        if (!res.ok) throw new Error(body.message || 'Não foi possível abrir o documento')
        setTitle(body.title)
        setTemplateId(body.templateId || '')
        editor.commands.setContent(body.content, { emitUpdate: false })
        setLoading(false)
      })
      .catch(fetchError => {
        if (fetchError.name === 'AbortError') return
        setError(fetchError.message)
        setLoading(false)
      })

    return () => controller.abort()
  }, [state, editor])

  // Templates do workspace para escolha (sem eles, só o padrão Simplifica)
  useEffect(() => {
    if (!state || !workspaceId) return

    const controller = new AbortController()

    fetch(`/api/documents/html-templates?workspaceId=${encodeURIComponent(workspaceId)}`, {
      cache: 'no-store',
      signal: controller.signal
    })
      .then(res => (res.ok ? res.json() : { data: [] }))
      .then(body => setTemplates(body.data ?? []))
      .catch(() => {})

    return () => controller.abort()
  }, [state, workspaceId])

  const selectedTemplate = templates.find(template => template.id === templateId) ?? null

  const previewHtml = useMemo(() => {
    if (tab !== 'preview' || !previewContent) return ''

    try {
      return renderHtmlDocument({
        title,
        content: previewContent,
        author: authorName,
        workspaceName,
        template: selectedTemplate?.html
      })
    } catch {
      return ''
    }
  }, [tab, previewContent, title, authorName, workspaceName, selectedTemplate])

  const handleTabChange = (_, next) => {
    if (!next) return
    if (next === 'preview') setPreviewContent(editor?.getJSON() ?? null)
    setTab(next)
  }

  const handleClose = () => {
    if (saving) return
    if (dirty && !window.confirm('Descartar as alterações deste documento?')) return
    onClose()
  }

  const handleSave = async () => {
    const trimmedTitle = title.trim()
    const content = editor?.getJSON()

    if (!trimmedTitle) {
      setError('Informe o título do documento')

      return
    }

    if (!content || isHtmlDocumentEmpty(content)) {
      setError('Escreva o conteúdo do documento')

      return
    }

    setSaving(true)
    setError('')

    try {
      const res = await fetch(isEdit ? `/api/documents/html/${fileId}` : '/api/documents/html', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: trimmedTitle,
          content,
          templateId: templateId || null,
          ...(!isEdit && { workspaceId, folderId })
        })
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.message || 'Erro ao salvar o documento')

        return
      }

      setDirty(false)
      onSaved(isEdit ? 'Documento atualizado!' : 'Documento criado!')
    } catch {
      setError('Erro de conexão')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullScreen={fullScreen}
      maxWidth='lg'
      fullWidth
      PaperProps={{ sx: fullScreen ? undefined : { height: '90vh' } }}
    >
      <DialogTitle className='flex items-center gap-3'>
        <span className='flex-1 min-w-0 truncate'>{isEdit ? 'Editar documento' : 'Novo documento'}</span>
        <ToggleButtonGroup exclusive size='small' value={tab} onChange={handleTabChange} aria-label='Modo'>
          <ToggleButton value='edit' aria-label='Escrever'>
            <i className='tabler-pencil text-lg' />
            <span className='hidden sm:inline ms-1.5'>Escrever</span>
          </ToggleButton>
          <ToggleButton value='preview' aria-label='Pré-visualizar'>
            <i className='tabler-eye text-lg' />
            <span className='hidden sm:inline ms-1.5'>Pré-visualizar</span>
          </ToggleButton>
        </ToggleButtonGroup>
        <IconButton size='small' onClick={handleClose} aria-label='Fechar' className='shrink-0'>
          <i className='tabler-x' />
        </IconButton>
      </DialogTitle>
      <DialogContent className='flex flex-col gap-3'>
        {error && <Alert severity='error'>{error}</Alert>}
        <div className='flex flex-col sm:flex-row gap-3 mt-2'>
          <TextField
            fullWidth
            label='Título do documento'
            value={title}
            onChange={event => {
              setTitle(event.target.value)
              setDirty(true)
            }}
            disabled={loading}
            inputProps={{ maxLength: HTML_DOCUMENT_LIMITS.titleChars }}
            helperText={
              isEdit
                ? 'O nome do arquivo não muda; use "Renomear" para alterá-lo.'
                : 'Também será o nome do arquivo (.html).'
            }
          />
          <TextField
            select
            label='Template'
            value={selectedTemplate ? templateId : ''}
            onChange={event => {
              setTemplateId(event.target.value)
              setDirty(true)
            }}
            disabled={loading}
            SelectProps={{ displayEmpty: true }}
            InputLabelProps={{ shrink: true }}
            helperText='Os templates são criados em “Templates”.'
            className='sm:w-72 shrink-0'
          >
            <MenuItem value=''>Padrão Simplifica</MenuItem>
            {templates.map(template => (
              <MenuItem key={template.id} value={template.id}>
                {template.name}
              </MenuItem>
            ))}
          </TextField>
        </div>

        {loading && (
          <div className='flex justify-center items-center min-h-[40vh]'>
            <CircularProgress />
          </div>
        )}

        <div className={loading || tab !== 'edit' ? 'hidden' : 'flex flex-col flex-1 min-h-0'}>
          <div className={`flex flex-col flex-1 min-h-0 rounded-lg border ${formDividerCls} overflow-hidden`}>
            {editor && <EditorToolbar editor={editor} />}
            <div className='flex-1 overflow-auto bg-[#f4f5f7] p-3 sm:p-6'>
              <div
                className='max-w-[820px] mx-auto bg-white rounded-lg shadow-sm px-5 sm:px-12 py-8 cursor-text'
                onClick={() => editor?.commands.focus()}
              >
                <Box sx={editorSx}>
                  <EditorContent editor={editor} />
                </Box>
              </div>
            </div>
          </div>
          <p className={`text-xs ${formMutedCls} mbs-2`}>
            {selectedTemplate
              ? `O documento é salvo com o template “${selectedTemplate.name}”. Veja em “Pré-visualizar”.`
              : 'O documento é salvo com o cabeçalho, a tipografia e o rodapé da Simplifica. Veja em “Pré-visualizar”.'}
          </p>
        </div>

        {!loading && tab === 'preview' && <HtmlPreview data={{ html: previewHtml }} title='Pré-visualização' />}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color='secondary' disabled={saving}>
          Cancelar
        </Button>
        <Button variant='contained' onClick={handleSave} disabled={saving || loading || !editor}>
          {saving ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar documento'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default HtmlDocumentEditorDialog
