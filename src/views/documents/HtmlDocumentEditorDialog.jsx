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
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import useMediaQuery from '@mui/material/useMediaQuery'
import { EditorContent, useEditor } from '@tiptap/react'

import { EditorToolbar, createRichTextExtensions, editorSx } from './DocumentRichText'
import { HtmlPreview } from './FilePreviewContent'
import { HTML_DOCUMENT_LIMITS, isHtmlDocumentEmpty, renderHtmlDocument } from '@/libs/documentHtml'
import { formDividerCls, formMutedCls } from '@/views/forms/formStyles'

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
    extensions: createRichTextExtensions('Escreva aqui o conteúdo do documento…'),
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
