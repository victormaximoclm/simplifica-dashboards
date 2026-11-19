'use client'

import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import { useEditorState } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { TextAlign } from '@tiptap/extension-text-align'
import { Placeholder } from '@tiptap/extension-placeholder'

import { sanitizeLinkHref } from '@/libs/documentHtml'
import { formDividerCls } from '@/views/forms/formStyles'

/**
 * Editor de texto formatado (TipTap) compartilhado: documentos HTML e blocos de texto do Site.
 * Só os nós e as marcas aceitos por sanitizeHtmlDocumentContent (src/libs/documentHtml.js) estão habilitados.
 */

/** Extensões do editor; `placeholder` é o texto exibido com o editor vazio */
export const createRichTextExtensions = placeholder => [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: { openOnClick: false, autolink: true, defaultProtocol: 'https', protocols: ['http', 'https', 'mailto'] }
  }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Placeholder.configure({ placeholder })
]

// Área de escrita em "papel" claro, com a mesma tipografia do template, para o usuário ver o resultado enquanto escreve
export const editorSx = {
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

export const EditorToolbar = ({ editor }) => {
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
