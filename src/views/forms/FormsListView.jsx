'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import ShareFormDialog from './builder/ShareFormDialog'

import {
  btnPrimary,
  btnPrimarySoft,
  btnSecondary,
  btnDangerSoft,
  formCardCls,
  formCardIconBgCls,
  formChipBadgeCls,
  formDividerCls,
  formIconMutedCls,
  formMutedCls,
  formPageCls,
  formSubtitleCls,
  formSuccessTextCls,
  formTitleCls
} from './formStyles'

const FormsListView = ({ forms: initialForms, canManage, canShare, lang }) => {
  const router = useRouter()
  const [forms, setForms] = useState(initialForms ?? [])
  const [deleteDialog, setDeleteDialog] = useState(false)
  const [formToDelete, setFormToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const [shareDialog, setShareDialog] = useState(false)
  const [formToShare, setFormToShare] = useState(null)

  useEffect(() => {
    setForms(initialForms ?? [])
  }, [initialForms])

  const goFill = formId => router.push(`/${lang}/forms/${formId}/fill`)
  const goEdit = formId => router.push(`/${lang}/forms/${formId}/edit`)
  const goLinks = formId => router.push(`/${lang}/forms/${formId}/links`)

  const handleOpenDelete = (e, form) => {
    e.stopPropagation()
    setFormToDelete(form)
    setDeleteError(null)
    setDeleteDialog(true)
  }

  const handleCloseDelete = () => {
    if (deleting) return
    setDeleteDialog(false)
    setFormToDelete(null)
    setDeleteError(null)
  }

  const handleConfirmDelete = async () => {
    if (!formToDelete) return

    setDeleting(true)
    setDeleteError(null)

    try {
      const res = await fetch(`/api/forms/${formToDelete.id}`, { method: 'DELETE' })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setDeleteError(data.message || 'Erro ao excluir formulário')
        setDeleting(false)
        return
      }

      setForms(prev => prev.filter(f => f.id !== formToDelete.id))
      window.dispatchEvent(new Event('forms-changed'))
      handleCloseDelete()
    } catch {
      setDeleteError('Erro de conexão')
    } finally {
      setDeleting(false)
    }
  }

  if (!forms?.length) {
    return (
      <div className='flex flex-col items-center justify-center min-h-[60vh] gap-4'>
        <i className={`tabler-forms text-6xl ${formIconMutedCls}`} />
        <h4 className={`text-xl font-medium ${formTitleCls}`}>Nenhum formulário disponível</h4>
        <p className={`${formMutedCls} text-center max-w-md`}>Nenhum formulário encontrado para o seu perfil.</p>
        {canManage && (
          <button type='button' onClick={() => router.push(`/${lang}/forms/new/edit`)} className={btnPrimary}>
            Criar formulário
          </button>
        )}
      </div>
    )
  }

  return (
    <>
      <div className={formPageCls}>
        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6'>
          <div>
            <h4 className={formTitleCls}>Formulários</h4>
            <p className={`${formSubtitleCls} mt-1`}>
              {forms.length} formulário{forms.length !== 1 ? 's' : ''} disponível{forms.length !== 1 ? 'is' : ''}
            </p>
          </div>
          {canManage && (
            <button
              type='button'
              onClick={() => router.push(`/${lang}/forms/new/edit`)}
              className={`${btnPrimary} w-full sm:w-auto shrink-0`}
            >
              <i className='tabler-plus text-base' />
              Novo formulário
            </button>
          )}
        </div>

        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
          {forms.map(form => (
            <FormCard
              key={form.id}
              form={form}
              canManage={canManage}
              canShare={canShare}
              onFill={() => goFill(form.id)}
              onEdit={() => goEdit(form.id)}
              onLinks={() => goLinks(form.id)}
              onShare={() => {
                setFormToShare(form)
                setShareDialog(true)
              }}
              onDelete={e => handleOpenDelete(e, form)}
            />
          ))}
        </div>
      </div>

      <Dialog open={deleteDialog} onClose={handleCloseDelete} maxWidth='sm' fullWidth>
        <DialogTitle sx={{ color: 'error.main', display: 'flex', alignItems: 'center', gap: 2 }}>
          <i className='tabler-alert-triangle' style={{ fontSize: '1.5rem' }} />
          Excluir formulário
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Tem certeza que deseja excluir o formulário <strong>&quot;{formToDelete?.title}&quot;</strong>? Esta ação
            não pode ser desfeita.
          </DialogContentText>
          {deleteError && <DialogContentText sx={{ color: 'error.main' }}>{deleteError}</DialogContentText>}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDelete} color='secondary' disabled={deleting}>
            Cancelar
          </Button>
          <Button onClick={handleConfirmDelete} variant='contained' color='error' disabled={deleting}>
            {deleting ? 'Excluindo...' : 'Excluir'}
          </Button>
        </DialogActions>
      </Dialog>

      <ShareFormDialog
        open={shareDialog}
        form={formToShare}
        onClose={() => {
          setShareDialog(false)
          setFormToShare(null)
        }}
      />
    </>
  )
}

const FormCard = ({ form, canManage, onFill, onEdit, onLinks, onDelete, onShare, canShare }) => {
  const [createdAt, setCreatedAt] = useState('')
  useEffect(() => {
    setCreatedAt(
      new Date(form.createdAt).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      })
    )
  }, [form.createdAt])

  return (
    <div
      className={`group relative ${formCardCls} p-5 flex flex-col gap-3 hover:border-[var(--mui-palette-primary-main)] hover:shadow-md transition-all`}
    >
      <div className='flex items-start gap-3 cursor-pointer' onClick={onFill}>
        <div className={`shrink-0 w-10 h-10 rounded-lg ${formCardIconBgCls} flex items-center justify-center`}>
          <i className='tabler-forms text-xl text-[var(--mui-palette-primary-main)]' />
        </div>
        <div className='flex-1 min-w-0'>
          <h6 className={`font-semibold truncate ${formTitleCls} text-base`}>{form.title}</h6>
          {form.description && <p className={`text-xs ${formMutedCls} mt-0.5 line-clamp-2`}>{form.description}</p>}
        </div>
      </div>

      <div className={`flex items-center gap-3 text-xs ${formMutedCls}`} onClick={onFill}>
        <span className='flex items-center gap-1'>
          <i className='tabler-calendar text-sm' />
          {createdAt || 'Carregando...'}
        </span>
        {form.allowPublicLink && (
          <span className={`flex items-center gap-1 ${formSuccessTextCls}`}>
            <i className='tabler-link text-sm' />
            Link público
          </span>
        )}
      </div>

      {form.allowedCargos?.length > 0 && (
        <div className='flex flex-wrap gap-1' onClick={onFill}>
          {form.allowedCargos.slice(0, 3).map(cargo => (
            <span key={cargo} className={formChipBadgeCls}>
              {cargo}
            </span>
          ))}
        </div>
      )}

      <div className={`flex flex-wrap items-center gap-2 pt-2 border-t ${formDividerCls}`}>
        <button type='button' onClick={onFill} className={btnPrimarySoft}>
          Preencher
        </button>
        {canManage && (
          <>
            <button type='button' onClick={onEdit} className={btnPrimarySoft}>
              Editar
            </button>
            <button type='button' onClick={onDelete} className={btnDangerSoft}>
              Excluir
            </button>
          </>
        )}
        {form.allowPublicLink && (
          <button type='button' onClick={onLinks} className={btnSecondary}>
            Link
          </button>
        )}
        {(canShare || canManage) && (
          <button type='button' onClick={onShare} className={btnSecondary}>
            Compartilhar
          </button>
        )}
      </div>
    </div>
  )
}

export default FormsListView
