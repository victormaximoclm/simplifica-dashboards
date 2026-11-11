'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Tooltip from '@mui/material/Tooltip'
import useMediaQuery from '@mui/material/useMediaQuery'
import { toast } from 'react-toastify'

import { HtmlPreview } from './FilePreviewContent'
import {
  DEFAULT_HTML_TEMPLATE,
  HTML_TEMPLATE_LIMITS,
  HTML_TEMPLATE_PLACEHOLDERS,
  renderHtmlDocument,
  validateHtmlTemplate
} from '@/libs/documentHtml'
import { formCaptionCls, formDividerCls, formMutedCls, formSectionTitleCls } from '@/views/forms/formStyles'

// Conteúdo de exemplo da pré-visualização do template
const SAMPLE_CONTENT = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Este é um texto de exemplo para você ver como o template apresenta o conteúdo.' }
      ]
    },
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Seção de exemplo' }] },
    {
      type: 'bulletList',
      content: ['Primeiro item da lista', 'Segundo item, com mais texto'].map(text => ({
        type: 'listItem',
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
      }))
    },
    {
      type: 'blockquote',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Um trecho em destaque.' }] }]
    }
  ]
}

const emptyForm = { mode: 'create', id: null, name: '', html: '' }

const templateError = html => {
  try {
    validateHtmlTemplate(html)

    return ''
  } catch (error) {
    return error.message
  }
}

const formatDate = value => new Date(value).toLocaleDateString('pt-BR')

/**
 * Templates HTML do workspace (SuperAdmin/SubAdmin): criar escrevendo/colando o HTML ou enviando um arquivo .html,
 * editar e excluir. Os templates aparecem para escolha no editor de documentos.
 */
const HtmlTemplatesDialog = ({ open, workspaceId, workspaceName, authorName, canEdit, canDelete, onClose }) => {
  const fullScreen = useMediaQuery(theme => theme.breakpoints.down('md'))
  const fileInputRef = useRef(null)
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState(null)
  const [tab, setTab] = useState('code')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const load = useCallback(async () => {
    if (!workspaceId) return

    setLoading(true)
    setError('')

    try {
      const res = await fetch(`/api/documents/html-templates?workspaceId=${encodeURIComponent(workspaceId)}`, {
        cache: 'no-store'
      })

      const body = await res.json().catch(() => ({}))

      if (!res.ok) throw new Error(body.message || 'Não foi possível carregar os templates')
      setTemplates(body.data)
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    if (!open) return

    setForm(null)
    setDirty(false)
    load()
  }, [open, load])

  const validationMessage = useMemo(() => (form?.html.trim() ? templateError(form.html) : ''), [form?.html])

  const previewHtml = useMemo(() => {
    if (tab !== 'preview' || !form || validationMessage || !form.html.trim()) return ''

    return renderHtmlDocument({
      title: form.name.trim() || 'Título do documento',
      content: SAMPLE_CONTENT,
      author: authorName,
      workspaceName,
      template: form.html
    })
  }, [tab, form, validationMessage, authorName, workspaceName])

  const updateForm = patch => {
    setForm(current => ({ ...current, ...patch }))
    setDirty(true)
  }

  const openForm = template => {
    setError('')
    setTab('code')
    setDirty(false)
    setForm(template ? { mode: 'edit', id: template.id, name: template.name, html: template.html } : emptyForm)
  }

  const confirmDiscard = () => !dirty || window.confirm('Descartar as alterações deste template?')

  const backToList = () => {
    if (!confirmDiscard()) return
    setForm(null)
    setDirty(false)
    setError('')
  }

  const handleClose = () => {
    if (saving || (form && !confirmDiscard())) return
    onClose()
  }

  const handleFile = async event => {
    const file = event.target.files?.[0]

    event.target.value = ''

    if (!file) return

    if (file.size > HTML_TEMPLATE_LIMITS.htmlBytes) {
      setError('O template deve ter no máximo 512 KB')

      return
    }

    const html = await file.text()

    setError('')
    updateForm({ html, ...(!form.name.trim() && { name: file.name.replace(/\.html?$/i, '').slice(0, 120) }) })
  }

  const handleSave = async () => {
    const name = form.name.trim()

    if (!name) {
      setError('Informe o nome do template')

      return
    }

    const message = templateError(form.html)

    if (message) {
      setError(message)

      return
    }

    setSaving(true)
    setError('')

    try {
      const isEdit = form.mode === 'edit'

      const res = await fetch(isEdit ? `/api/documents/html-templates/${form.id}` : '/api/documents/html-templates', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit ? { name, html: form.html } : { workspaceId, name, html: form.html })
      })

      const body = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(body.message || 'Erro ao salvar o template')

        return
      }

      toast.success(isEdit ? 'Template atualizado!' : 'Template criado!')
      setForm(null)
      setDirty(false)
      load()
    } catch {
      setError('Erro de conexão')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async template => {
    const usage = template.documentsCount
      ? `\n\n${template.documentsCount} documento(s) usam este template. Os arquivos já gerados não mudam; ao serem reeditados, passam a usar o padrão Simplifica.`
      : ''

    if (!window.confirm(`Excluir o template "${template.name}"?${usage}`)) return

    setError('')

    try {
      const res = await fetch(`/api/documents/html-templates/${template.id}`, { method: 'DELETE' })
      const body = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(body.message || 'Erro ao excluir o template')

        return
      }

      toast.success('Template excluído!')
      load()
    } catch {
      setError('Erro de conexão')
    }
  }

  const renderList = () => (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2'>
        <p className={formMutedCls}>
          Templates deste workspace ficam disponíveis em “Novo documento”. Sem template, vale o padrão Simplifica.
        </p>
        <Button
          variant='contained'
          onClick={() => openForm(null)}
          startIcon={<i className='tabler-plus' />}
          className='shrink-0 whitespace-nowrap'
        >
          Novo template
        </Button>
      </div>

      {loading ? (
        <div className='flex justify-center py-10'>
          <CircularProgress />
        </div>
      ) : templates.length === 0 ? (
        <div className={`rounded-lg border border-dashed ${formDividerCls} p-8 text-center`}>
          <i className={`tabler-template text-4xl ${formMutedCls}`} />
          <p className={`${formMutedCls} mt-2`}>Nenhum template criado neste workspace ainda.</p>
        </div>
      ) : (
        <ul className={`rounded-lg border ${formDividerCls} divide-y divide-[var(--mui-palette-divider)]`}>
          {templates.map(template => (
            <li key={template.id} className='flex items-center gap-3 px-4 py-3'>
              <i className='tabler-template text-xl text-[var(--mui-palette-primary-main)] shrink-0' />
              <div className='min-w-0 flex-1'>
                <p className={`${formSectionTitleCls} truncate`} title={template.name}>
                  {template.name}
                </p>
                <p className={formCaptionCls}>
                  {template.documentsCount === 1 ? '1 documento' : `${template.documentsCount} documentos`} · atualizado
                  em {formatDate(template.updatedAt)}
                  {template.createdBy?.name ? ` · criado por ${template.createdBy.name}` : ''}
                </p>
              </div>
              {canEdit && (
                <Tooltip title='Editar'>
                  <IconButton size='small' aria-label={`Editar ${template.name}`} onClick={() => openForm(template)}>
                    <i className='tabler-edit' />
                  </IconButton>
                </Tooltip>
              )}
              {canDelete && (
                <Tooltip title='Excluir'>
                  <IconButton
                    size='small'
                    aria-label={`Excluir ${template.name}`}
                    onClick={() => handleDelete(template)}
                    className='text-[var(--mui-palette-error-main)]'
                  >
                    <i className='tabler-trash' />
                  </IconButton>
                </Tooltip>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )

  const renderForm = () => (
    <div className='flex flex-col gap-3 flex-1 min-h-0'>
      <TextField
        fullWidth
        label='Nome do template'
        value={form.name}
        onChange={event => updateForm({ name: event.target.value })}
        inputProps={{ maxLength: HTML_TEMPLATE_LIMITS.nameChars }}
        sx={{ mt: 1 }}
      />

      <div className='flex flex-wrap items-center gap-2'>
        <ToggleButtonGroup
          exclusive
          size='small'
          value={tab}
          onChange={(_, next) => next && setTab(next)}
          aria-label='Modo'
        >
          <ToggleButton value='code' aria-label='Código'>
            <i className='tabler-code text-lg' />
            <span className='ms-1.5'>Código</span>
          </ToggleButton>
          <ToggleButton value='preview' aria-label='Pré-visualizar'>
            <i className='tabler-eye text-lg' />
            <span className='ms-1.5'>Pré-visualizar</span>
          </ToggleButton>
        </ToggleButtonGroup>
        <span className='flex-1' />
        <Button
          size='small'
          variant='outlined'
          startIcon={<i className='tabler-upload' />}
          onClick={() => fileInputRef.current?.click()}
        >
          Enviar arquivo .html
        </Button>
        <Button
          size='small'
          variant='outlined'
          color='secondary'
          startIcon={<i className='tabler-copy' />}
          onClick={() =>
            (!form.html.trim() || window.confirm('Substituir o HTML atual pelo modelo Simplifica?')) &&
            updateForm({ html: DEFAULT_HTML_TEMPLATE })
          }
        >
          Começar do modelo Simplifica
        </Button>
        <input ref={fileInputRef} type='file' accept='.html,.htm,text/html' className='hidden' onChange={handleFile} />
      </div>

      {tab === 'code' ? (
        <TextField
          fullWidth
          multiline
          minRows={14}
          maxRows={22}
          label='HTML do template'
          placeholder='Cole aqui o HTML, com o marcador {{conteudo}} onde o texto do documento deve entrar'
          value={form.html}
          onChange={event => updateForm({ html: event.target.value })}
          InputProps={{ sx: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 13 } }}
          inputProps={{ spellCheck: false, 'aria-label': 'HTML do template' }}
        />
      ) : previewHtml ? (
        <HtmlPreview data={{ html: previewHtml }} title='Pré-visualização do template' />
      ) : (
        <Alert severity='info'>Corrija o HTML do template para ver a pré-visualização.</Alert>
      )}

      {validationMessage && <Alert severity='warning'>{validationMessage}</Alert>}

      <div className={`rounded-lg border ${formDividerCls} p-3`}>
        <p className={`${formSectionTitleCls} mb-1`}>Marcadores</p>
        <ul className={`${formCaptionCls} grid sm:grid-cols-2 gap-x-6 gap-y-0.5`}>
          {HTML_TEMPLATE_PLACEHOLDERS.map(item => (
            <li key={item.key}>
              <code className='font-mono text-[var(--mui-palette-primary-main)]'>{`{{${item.key}}}`}</code> —{' '}
              {item.label}
            </li>
          ))}
        </ul>
        <p className={`${formCaptionCls} mt-2`}>
          Use CSS dentro de &lt;style&gt; e imagens embutidas (data: ou &lt;svg&gt;). Scripts, formulários, frames e
          recursos externos não são permitidos. Alterações valem para documentos novos ou reeditados.
        </p>
      </div>
    </div>
  )

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullScreen={fullScreen}
      maxWidth={form ? 'lg' : 'md'}
      fullWidth
      PaperProps={{ sx: fullScreen || !form ? undefined : { height: '90vh' } }}
    >
      <DialogTitle className='flex items-center gap-2'>
        {form && (
          <IconButton size='small' onClick={backToList} aria-label='Voltar' disabled={saving}>
            <i className='tabler-arrow-left' />
          </IconButton>
        )}
        <span className='flex-1 min-w-0 truncate'>
          {!form ? 'Templates HTML' : form.mode === 'edit' ? 'Editar template' : 'Novo template'}
        </span>
        <IconButton size='small' onClick={handleClose} aria-label='Fechar' className='shrink-0'>
          <i className='tabler-x' />
        </IconButton>
      </DialogTitle>
      <DialogContent className='flex flex-col gap-3'>
        {error && <Alert severity='error'>{error}</Alert>}
        {form ? renderForm() : renderList()}
      </DialogContent>
      <DialogActions>
        {form ? (
          <>
            <Button onClick={backToList} color='secondary' disabled={saving}>
              Cancelar
            </Button>
            <Button variant='contained' onClick={handleSave} disabled={saving || !!validationMessage}>
              {saving ? 'Salvando...' : form.mode === 'edit' ? 'Salvar alterações' : 'Criar template'}
            </Button>
          </>
        ) : (
          <Button onClick={handleClose} color='secondary'>
            Fechar
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}

export default HtmlTemplatesDialog
