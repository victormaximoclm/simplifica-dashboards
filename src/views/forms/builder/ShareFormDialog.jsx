'use client'

import { useEffect, useState } from 'react'

import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'

import RoleMultiSelect, { toRoleIds } from '../RoleMultiSelect'

const ShareFormDialog = ({ open, form, onClose }) => {
  const [roles, setRoles] = useState([])
  const [selectedRoles, setSelectedRoles] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const workspaceId = form?.workspaceId

  const handleSave = async () => {
    if (!form) return

    setSaving(true)
    setError(null)

    try {
      const res = await fetch(`/api/forms/${form.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          allowedRoles: selectedRoles
        })
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))

        throw new Error(data.message || 'Erro ao salvar permissões')
      }

      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!open || !form?.workspaceId || !form) return

    const loadRoles = async () => {
      setLoading(true)
      setError(null)

      try {
        const res = await fetch(`/api/apps/custom-roles?workspaceId=${form.workspaceId}`)

        if (!res.ok) {
          throw new Error('Erro ao carregar funções')
        }

        const data = await res.json()

        setRoles(data)

        setSelectedRoles(toRoleIds(form.allowedRoles, data))
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    loadRoles()
  }, [open, form])

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>Compartilhar formulário</DialogTitle>

      <DialogContent>
        <div className='flex flex-col gap-4'>
          <div>
            <p className='font-medium'>{form?.title}</p>
            <p className='text-sm text-gray-500'>Escolha quais funções podem ver este formulário.</p>
          </div>

          {loading && <p className='text-sm'>Carregando funções...</p>}

          {error && <p className='text-sm text-red-500'>{error}</p>}

          {!loading && roles.length === 0 && <p className='text-sm'>Nenhuma função cadastrada neste workspace.</p>}

          {!loading && roles.length > 0 && (
            <RoleMultiSelect roles={roles} value={selectedRoles} onChange={setSelectedRoles} />
          )}
        </div>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancelar
        </Button>

        <Button onClick={handleSave} variant='contained' disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default ShareFormDialog
