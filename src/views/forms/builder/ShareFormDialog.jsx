'use client'

import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Autocomplete from '@mui/material/Autocomplete'
import TextField from '@mui/material/TextField'
import Chip from '@mui/material/Chip'

import { useEffect, useState } from 'react'

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
          throw new Error('Erro ao carregar cargos')
        }

        const data = await res.json()

        setRoles(data)

        setSelectedRoles(form.allowedRoles ?? [])
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
            <p className='text-sm text-gray-500'>Selecione quais cargos podem visualizar este formulário.</p>
          </div>

          {loading && <p className='text-sm'>Carregando cargos...</p>}

          {error && <p className='text-sm text-red-500'>{error}</p>}

          {!loading && roles.length === 0 && <p className='text-sm'>Nenhum cargo encontrado neste workspace.</p>}

          <Autocomplete
            multiple
            options={roles.filter(role => !selectedRoles.includes(role.id))}
            value={[]}
            onChange={(_, value) => {
              if (value.length > 0) {
                const role = value[value.length - 1]

                setSelectedRoles(prev => (prev.includes(role.id) ? prev : [...prev, role.id]))
              }
            }}
            getOptionLabel={option => option.name}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            renderInput={params => <TextField {...params} label='Adicionar cargo' placeholder='Pesquisar cargo...' />}
          />
          <div className='mt-4'>
            <p className='text-sm font-medium mb-2'>Cargos com acesso ao formulário</p>

            <div className='flex flex-wrap gap-2'>
              {selectedRoles.map(roleId => {
                const role = roles.find(r => r.id === roleId)

                if (!role) return null

                return (
                  <Chip
                    key={role.id}
                    label={role.name}
                    onDelete={() => setSelectedRoles(prev => prev.filter(id => id !== role.id))}
                  />
                )
              })}
            </div>
          </div>
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
