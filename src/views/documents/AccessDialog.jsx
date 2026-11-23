'use client'

import { useEffect, useState } from 'react'

import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import TextField from '@mui/material/TextField'

const itemLabel = item => (item?.kind === 'folder' ? 'pasta' : item?.isSite ? 'site' : 'arquivo')

const levelText = canDownload => (canDownload ? 'ver e baixar' : 'só ver')

/**
 * Cargos que os itens selecionados já têm: [{ id, name, count, canDownload, mixed }]. `count` = em quantos itens o
 * cargo aparece; `mixed` = nem todos os itens que o têm dão o mesmo nível (a lista dos itens traz `accessRoles`).
 */
function summarizeRoles(items) {
  const byRole = new Map()

  for (const item of items) {
    for (const role of item.accessRoles ?? []) {
      const entry = byRole.get(role.id) ?? { id: role.id, name: role.name, count: 0, downloads: 0 }

      entry.count++
      if (role.canDownload) entry.downloads++
      byRole.set(role.id, entry)
    }
  }

  return [...byRole.values()].map(({ downloads, ...entry }) => ({
    ...entry,
    canDownload: downloads === entry.count,
    mixed: downloads > 0 && downloads < entry.count
  }))
}

/**
 * Gerenciar acesso por cargo de uma pasta/arquivo (Site incluso) ou de vários itens de uma vez. Cada cargo tem um
 * nível: "Só ver", "Ver e baixar" ou "Remover acesso". Pasta libera tudo dentro dela; um arquivo liberado sozinho
 * aparece dentro das pastas que levam até ele, sem mostrar os outros itens. Sem cargos, o item fica restrito a
 * admin e acima (ou segue o acesso da pasta onde está).
 *
 * Vários itens: a lista mostra os cargos que eles já têm ("em N de M"); mudar o nível aplica a todos, remover tira
 * de todos e os cargos novos entram em todos. Só o que você mudar é enviado.
 */
const AccessDialog = ({ item, items = null, onClose, onSaved }) => {
  const [roles, setRoles] = useState([])

  // [{ id, name?, canDownload, mixed?, count?, initial?, dirty? }]
  const [selected, setSelected] = useState([])
  const [initialIds, setInitialIds] = useState([])
  const [inherited, setInherited] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const bulk = !item && Array.isArray(items) && items.length > 0
  const workspaceId = item?.workspaceId ?? items?.[0]?.workspaceId
  const open = !!item || bulk
  const base = item ? `/api/documents/${item.kind === 'folder' ? 'folders' : 'files'}/${item.id}/access` : null
  const isFolder = item?.kind === 'folder'

  useEffect(() => {
    setError('')
    setInherited(null)

    if (!item && !bulk) return undefined

    const controller = new AbortController()

    setLoading(true)
    setSelected([])
    setInitialIds([])

    Promise.all([
      bulk
        ? Promise.resolve(null)
        : fetch(base, { cache: 'no-store', signal: controller.signal }).then(res =>
            res.ok ? res.json() : Promise.reject(res)
          ),
      fetch(`/api/apps/custom-roles?workspaceId=${workspaceId}`, {
        cache: 'no-store',
        signal: controller.signal
      }).then(res => (res.ok ? res.json() : Promise.reject(res)))
    ])
      .then(([access, allRoles]) => {
        setRoles(Array.isArray(allRoles) ? allRoles : [])

        const current = bulk
          ? summarizeRoles(items).map(role => ({ ...role, initial: true }))
          : access.data.roles.map(role => ({ id: role.id, name: role.name, canDownload: !!role.canDownload }))

        setSelected(current)
        setInitialIds(current.map(role => role.id))
        setInherited(access?.data?.inherited ?? null)
      })
      .catch(err => {
        if (err?.name !== 'AbortError') setError('Não foi possível carregar o acesso')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [item, bulk, base, workspaceId]) // eslint-disable-line react-hooks/exhaustive-deps

  const roleName = entry => entry.name ?? roles.find(role => role.id === entry.id)?.name

  const changeLevel = (entry, value) => {
    if (value === 'remove') {
      setSelected(prev => prev.filter(candidate => candidate.id !== entry.id))

      return
    }

    setSelected(prev =>
      prev.map(candidate =>
        candidate.id === entry.id
          ? { ...candidate, canDownload: value === 'download', mixed: false, dirty: true }
          : candidate
      )
    )
  }

  // Lote: só envia o que mudou (cargos novos ou com nível alterado) e o que foi removido
  const changed = selected.filter(entry => entry.dirty || (bulk && !entry.initial))
  const removedIds = bulk ? initialIds.filter(id => !selected.some(entry => entry.id === id)) : []
  const nothingToSave = bulk && changed.length === 0 && removedIds.length === 0

  const handleSave = async () => {
    setSaving(true)
    setError('')

    try {
      const toRole = entry => ({ roleId: entry.id, canDownload: entry.canDownload })

      const res = await fetch(bulk ? '/api/documents/access' : base, {
        method: bulk ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          bulk
            ? {
                items: items.map(entry => ({ kind: entry.kind, id: entry.id })),
                mode: 'add',
                roles: changed.map(toRole),
                removeRoleIds: removedIds
              }
            : { roles: selected.map(toRole) }
        )
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.message || 'Erro ao salvar o acesso')

        return
      }

      onSaved(data.data)
    } catch {
      setError('Erro de conexão ao salvar o acesso')
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    if (!saving) onClose()
  }

  const intro = bulk
    ? `${items.length} ${items.length === 1 ? 'item selecionado' : 'itens selecionados'}. Pastas liberam tudo o que está dentro delas.`
    : isFolder
      ? `Cargos com acesso à pasta "${item?.name}" e a tudo o que está dentro dela. Para liberar só um arquivo, abra o menu do próprio arquivo: a pessoa verá as pastas até ele, mas apenas ele.`
      : `Cargos com acesso ${item ? `ao ${itemLabel(item)} "${item.name}"` : ''}. As pastas que levam até ele aparecem para a pessoa, mas só com ele dentro.`

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth='sm'>
      <DialogTitle>{bulk ? `Gerenciar acesso de ${items.length} itens` : 'Gerenciar acesso'}</DialogTitle>
      <DialogContent>
        <div className='flex flex-col gap-4 pt-2'>
          <p className='text-sm'>{intro} Administradores sempre veem tudo do próprio workspace.</p>

          {bulk && (
            <div>
              <p className='text-sm font-medium mb-2'>Itens afetados</p>
              <div className='flex flex-wrap gap-1.5 max-h-28 overflow-y-auto'>
                {items.map(entry => (
                  <Chip
                    key={`${entry.kind}:${entry.id}`}
                    size='small'
                    variant='tonal'
                    color={entry.kind === 'folder' ? 'primary' : 'default'}
                    icon={<i className={entry.kind === 'folder' ? 'tabler-folder' : 'tabler-file'} />}
                    label={entry.name}
                    sx={{ maxWidth: 220 }}
                  />
                ))}
              </div>
            </div>
          )}

          {error && <Alert severity='error'>{error}</Alert>}

          {loading ? (
            <div className='flex justify-center py-4'>
              <CircularProgress size={24} />
            </div>
          ) : (
            <>
              {roles.length === 0 && !error && (
                <Alert severity='info'>Nenhum cargo encontrado neste workspace. Crie cargos em Funções.</Alert>
              )}

              <Autocomplete
                multiple
                options={roles.filter(role => !selected.some(entry => entry.id === role.id))}
                value={[]}
                onChange={(_, value) => {
                  const role = value[value.length - 1]

                  if (role) {
                    setSelected(prev =>
                      prev.some(entry => entry.id === role.id)
                        ? prev
                        : [...prev, { id: role.id, name: role.name, canDownload: false, dirty: true }]
                    )
                  }
                }}
                getOptionLabel={option => option.name}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                renderInput={params => <TextField {...params} label='Adicionar cargo' placeholder='Pesquisar cargo...' />}
              />

              <div>
                <p className='text-sm font-medium mb-2'>Cargos com acesso</p>

                {selected.length === 0 && <p className='text-sm opacity-70'>Nenhum cargo.</p>}

                <div className='flex flex-col gap-2'>
                  {selected.map(entry => (
                    <div key={entry.id} className='flex items-center gap-2'>
                      <div className='flex-1 min-w-0'>
                        <p className='truncate text-sm'>{roleName(entry) ?? entry.id}</p>
                        {bulk && entry.initial && (
                          <p className='text-xs opacity-70'>
                            em {entry.count} de {items.length} {items.length === 1 ? 'item' : 'itens'}
                          </p>
                        )}
                      </div>
                      <Select
                        size='small'
                        value={entry.mixed ? 'mixed' : entry.canDownload ? 'download' : 'view'}
                        onChange={event => changeLevel(entry, event.target.value)}
                        inputProps={{ 'aria-label': `Nível de acesso de ${roleName(entry) ?? entry.id}` }}
                        sx={{ minWidth: 180 }}
                      >
                        {entry.mixed && (
                          <MenuItem value='mixed' disabled>
                            Níveis diferentes
                          </MenuItem>
                        )}
                        <MenuItem value='view'>Só ver</MenuItem>
                        <MenuItem value='download'>Ver e baixar</MenuItem>
                        <MenuItem value='remove'>Remover acesso</MenuItem>
                      </Select>
                      <IconButton
                        size='small'
                        title='Remover acesso'
                        aria-label={`Remover acesso de ${roleName(entry) ?? entry.id}`}
                        onClick={() => changeLevel(entry, 'remove')}
                      >
                        <i className='tabler-x' />
                      </IconButton>
                    </div>
                  ))}
                </div>
              </div>

              {selected.length === 0 && !bulk && (
                <Alert severity={inherited ? 'info' : 'warning'}>
                  {inherited
                    ? `Sem cargos próprios: segue o acesso da pasta "${inherited.name}" (${inherited.roles
                        .map(role => `${role.name}: ${levelText(role.canDownload)}`)
                        .join(', ')}).`
                    : 'Sem cargos, só administradores veem este item.'}
                </Alert>
              )}
            </>
          )}
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={saving}>
          Cancelar
        </Button>
        <Button onClick={handleSave} variant='contained' disabled={saving || loading || nothingToSave}>
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default AccessDialog
