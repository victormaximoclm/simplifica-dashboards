'use client'

import { useEffect, useMemo, useState } from 'react'

import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

const linkTypeLabel = link => (link.permanent == null ? '' : link.permanent ? ' (permanente)' : ' (uso único)')

/** Motivo de um envio recusado ou com falha (after.reason gravado pela rota de envio) */
const SUBMIT_REASON_LABELS = {
  rate_limited: () => 'Muitos envios em sequência',
  invalid_request: () => 'Dados do envio ilegíveis',
  form_not_found: () => 'Formulário não encontrado',
  invalid_fields: after => after.message || 'Campos inválidos',
  public_link_disabled: () => 'Links públicos desativados no formulário',
  invalid_token: () => 'Link inválido',
  link_revoked: () => 'Link revogado',
  link_already_used: () => 'Link já usado',
  link_expired: () => 'Link expirado',
  not_authenticated: () => 'Sem login',
  no_permission: () => 'Sem permissão para enviar',
  webhook_error: after => `n8n respondeu com erro ${after.webhookStatus}`,
  webhook_unreachable: after => `n8n fora do ar ou inacessível${after.errorCode ? ` (${after.errorCode})` : ''}`,
  webhook_timeout: () => 'n8n não respondeu a tempo',
  internal_error: after => `Erro interno${after.error ? `: ${after.error}` : ''}`
}

// Quem fez, quando não há usuário: envio por link público ou rotina agendada do servidor
const VIA_LABELS = { public_link: 'Link público', cron: 'Sistema' }

// Falha do sistema em vermelho, recusa do pedido em amarelo
const errorColor = action => {
  if (/_FAILED$/.test(action ?? '')) return 'error'
  if (/_REJECTED$/.test(action ?? '')) return 'warning'

  return null
}

/** Texto do erro mostrado abaixo da ação */
const errorReason = item => {
  if (!errorColor(item.action) || !item.after) return null
  const after = item.after

  if (item.action.startsWith('FORM_SUBMIT_')) {
    // Registros antigos de falha não tinham reason, só o status do n8n
    if (!after.reason) return after.webhookStatus ? SUBMIT_REASON_LABELS.webhook_error(after) : null

    return SUBMIT_REASON_LABELS[after.reason]?.(after) ?? after.reason
  }

  // Demais ações (withActionAudit): a mensagem que a pessoa viu e, na falha, o erro real
  const parts = [after.message, after.error && after.error !== after.message ? after.error : null].filter(Boolean)

  return parts.length ? parts.join(': ') : after.status ? `Erro ${after.status}` : null
}

/** typeOptions: [{ value, label }] mostra o filtro "Tipo"; o value vai para a API como ?type= */
export default function AuditLogsTable({
  title,
  subheader,
  endpoint,
  searchLabel = 'Buscar ação/ID',
  typeOptions = null
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ totalPages: 1, total: 0 })

  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [tenantId, setTenantId] = useState('')
  const [userId, setUserId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const [workspaces, setWorkspaces] = useState([])
  const [users, setUsers] = useState([])

  const query = useMemo(() => q.trim(), [q])

  useEffect(() => {
    let active = true

    Promise.all([
      fetch('/api/apps/workspaces', { cache: 'no-store' }).then(r => (r.ok ? r.json() : [])),
      fetch('/api/apps/users', { cache: 'no-store' }).then(r => (r.ok ? r.json() : []))
    ])
      .then(([ws, us]) => {
        if (!active) return
        setWorkspaces(Array.isArray(ws) ? ws : [])
        setUsers(Array.isArray(us) ? us : [])
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true

    const fetchData = async () => {
      setLoading(true)
      setError('')

      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: '20'
        })

        if (query) params.set('q', query)
        if (type) params.set('type', type)
        if (tenantId) params.set('tenantId', tenantId)
        if (userId) params.set('userId', userId)
        if (from) params.set('from', from)
        if (to) params.set('to', to)

        const res = await fetch(`${endpoint}?${params.toString()}`, { cache: 'no-store' })
        const data = await res.json()

        if (!res.ok) throw new Error(data.message || 'Erro ao carregar audit logs')
        if (!active) return
        setRows(data.items || [])
        setPagination(data.pagination || { totalPages: 1, total: 0 })
      } catch (e) {
        if (!active) return
        setError(e instanceof Error ? e.message : 'Erro ao carregar')
      } finally {
        if (active) setLoading(false)
      }
    }

    fetchData()

    return () => {
      active = false
    }
  }, [endpoint, page, query, type, tenantId, userId, from, to])

  return (
    <Card>
      <CardHeader title={title} subheader={subheader} />
      <CardContent>
        <Box display='flex' gap={2} alignItems='center' mb={3} flexWrap='wrap'>
          <TextField
            label={searchLabel}
            value={q}
            onChange={e => {
              setPage(1)
              setQ(e.target.value)
            }}
            size='small'
          />

          {typeOptions && (
            <FormControl size='small' sx={{ minWidth: 200 }}>
              <InputLabel>Tipo</InputLabel>
              <Select
                label='Tipo'
                value={type}
                onChange={e => {
                  setPage(1)
                  setType(e.target.value)
                }}
              >
                <MenuItem value=''>Todos</MenuItem>
                {typeOptions.map(option => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <FormControl size='small' sx={{ minWidth: 220 }}>
            <InputLabel>Workspace</InputLabel>
            <Select
              label='Workspace'
              value={tenantId}
              onChange={e => {
                setPage(1)
                setTenantId(e.target.value)
              }}
            >
              <MenuItem value=''>Todos</MenuItem>
              {workspaces.map(ws => (
                <MenuItem key={ws.id} value={ws.id}>
                  {ws.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size='small' sx={{ minWidth: 240 }}>
            <InputLabel>Usuário</InputLabel>
            <Select
              label='Usuário'
              value={userId}
              onChange={e => {
                setPage(1)
                setUserId(e.target.value)
              }}
            >
              <MenuItem value=''>Todos</MenuItem>
              {users.map(u => (
                <MenuItem key={u.id} value={u.id}>
                  {u.name || u.email || u.id}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label='De'
            type='date'
            value={from}
            onChange={e => {
              setPage(1)
              setFrom(e.target.value)
            }}
            size='small'
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label='Até'
            type='date'
            value={to}
            onChange={e => {
              setPage(1)
              setTo(e.target.value)
            }}
            size='small'
            InputLabelProps={{ shrink: true }}
          />

          <Chip label={`Total: ${pagination.total || 0}`} variant='tonal' />
        </Box>

        {loading ? (
          <Box display='flex' justifyContent='center' py={8}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity='error'>{error}</Alert>
        ) : (
          <>
            <TableContainer>
              <Table size='small'>
                <TableHead>
                  <TableRow>
                    <TableCell>Quando</TableCell>
                    <TableCell>Ação</TableCell>
                    <TableCell>Recurso</TableCell>
                    <TableCell>Nome do Recurso</TableCell>
                    <TableCell>Usuário</TableCell>
                    <TableCell>Workspace</TableCell>
                    <TableCell>Resource ID</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align='center'>
                        <Typography color='text.secondary'>Nenhum registro encontrado.</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map(item => (
                      <TableRow key={item.id}>
                        <TableCell>{new Date(item.createdAt).toLocaleString('pt-BR')}</TableCell>
                        <TableCell>
                          <Chip
                            label={item.action}
                            size='small'
                            color={errorColor(item.action) ?? 'default'}
                            variant={errorColor(item.action) ? 'tonal' : 'filled'}
                          />
                          {errorReason(item) && (
                            <Typography
                              variant='caption'
                              color='text.secondary'
                              display='block'
                              sx={{ mt: 0.5, maxWidth: 260 }}
                            >
                              {errorReason(item)}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>{item.entityType}</TableCell>
                        <TableCell>
                          {item.resourceLabel || '-'}
                          {item.publicLink && (
                            <Typography
                              variant='caption'
                              color='text.secondary'
                              display='block'
                              sx={{ wordBreak: 'break-all' }}
                            >
                              {item.publicLink.url ?? `Link excluído (${item.publicLink.id})`}
                              {linkTypeLabel(item.publicLink)}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          {item.user?.name || item.user?.email || VIA_LABELS[item.metadata?.via] || '-'}
                        </TableCell>
                        <TableCell>{item.tenant?.name || '-'}</TableCell>
                        <TableCell>{item.entityId || '-'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            <Box display='flex' justifyContent='space-between' alignItems='center' mt={3}>
              <Button variant='outlined' disabled={page <= 1} onClick={() => setPage(prev => Math.max(1, prev - 1))}>
                Anterior
              </Button>
              <Typography variant='body2'>
                Página {page} de {pagination.totalPages || 1}
              </Typography>
              <Button
                variant='outlined'
                disabled={page >= (pagination.totalPages || 1)}
                onClick={() => setPage(prev => prev + 1)}
              >
                Próxima
              </Button>
            </Box>
          </>
        )}
      </CardContent>
    </Card>
  )
}
