'use client'

// React Imports
import { useEffect, useState, useMemo } from 'react'

// Next Imports
import { useParams } from 'next/navigation'

// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import Checkbox from '@mui/material/Checkbox'
import IconButton from '@mui/material/IconButton'
import { styled } from '@mui/material/styles'
import TablePagination from '@mui/material/TablePagination'
import MenuItem from '@mui/material/MenuItem'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogActions from '@mui/material/DialogActions'

// Third-party Imports
import classnames from 'classnames'
import { rankItem } from '@tanstack/match-sorter-utils'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getFilteredRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFacetedMinMaxValues,
  getPaginationRowModel,
  getSortedRowModel
} from '@tanstack/react-table'

// Next-Auth Imports
import { useSession } from 'next-auth/react'

// Component Imports
import TableFilters from './TableFilters'
import AddUserDrawer from './AddUserDrawer'
import EditUserDrawer from './EditUserDrawer'
import OptionMenu from '@core/components/option-menu'
import TablePaginationComponent from '@components/TablePaginationComponent'
import CustomTextField from '@core/components/mui/TextField'
import CustomAvatar from '@core/components/mui/Avatar'

// Util Imports
import { getInitials } from '@/utils/getInitials'
import { getLocalizedUrl } from '@/utils/i18n'

// Style Imports
import tableStyles from '@core/styles/table.module.css'

// Styled Components
const Icon = styled('i')({})

const fuzzyFilter = (row, columnId, value, addMeta) => {
  // Rank the item
  const itemRank = rankItem(row.getValue(columnId), value)

  // Store the itemRank info
  addMeta({
    itemRank
  })

  // Return if the item should be filtered in/out
  return itemRank.passed
}

const DebouncedInput = ({ value: initialValue, onChange, debounce = 500, ...props }) => {
  // States
  const [value, setValue] = useState(initialValue)

  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])
  useEffect(() => {
    const timeout = setTimeout(() => {
      onChange(value)
    }, debounce)

    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return <CustomTextField {...props} value={value} onChange={e => setValue(e.target.value)} />
}

// Vars
const userRoleObj = {
  superAdmin: { icon: 'tabler-shield-star', color: 'error' },
  subAdmin: { icon: 'tabler-shield-check', color: 'info' },
  admin: { icon: 'tabler-crown', color: 'warning' },
  user: { icon: 'tabler-user', color: 'primary' }
}

const userStatusObj = {
  active: { color: 'success', label: 'Ativo' },
  pending: { color: 'warning', label: 'Pendente' },
  inactive: { color: 'secondary', label: 'Inativo' }
}

// Column Definitions
const columnHelper = createColumnHelper()

const UserListTable = ({ tableData, workspaces }) => {
  // States
  const [addUserOpen, setAddUserOpen] = useState(false)
  const [editUserOpen, setEditUserOpen] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [rowSelection, setRowSelection] = useState({})
  const [data, setData] = useState(...[tableData])
  const [filteredData, setFilteredData] = useState(data)
  const [globalFilter, setGlobalFilter] = useState('')

  // Hooks
  const { lang: locale } = useParams()
  const { data: session } = useSession()
  const callerRole = session?.user?.role
  const isHighAdmin = callerRole === 'superAdmin' || callerRole === 'subAdmin'

  const handleEdit = user => {
    setEditingUser(user)
    setEditUserOpen(true)
  }

  const handleEditSave = updatedUser => {
    setData(prev =>
      prev.map(u =>
        u.id === updatedUser.id
          ? {
              ...u,
              role: updatedUser.role,
              status: updatedUser.status,
              workspace: updatedUser.workspace,
              customRole: updatedUser.customRole
            }
          : u
      )
    )
    setFilteredData(prev =>
      prev.map(u =>
        u.id === updatedUser.id
          ? {
              ...u,
              role: updatedUser.role,
              status: updatedUser.status,
              workspace: updatedUser.workspace,
              customRole: updatedUser.customRole
            }
          : u
      )
    )
  }

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [userToDelete, setUserToDelete] = useState(null)
  const [resendingInvite, setResendingInvite] = useState(null)

  const openDeleteDialog = user => {
    setUserToDelete(user)
    setDeleteDialogOpen(true)
  }

  const handleResendInvite = async user => {
    setResendingInvite(user.id)

    try {
      const res = await fetch('/api/apps/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          ...(user.workspace?.id ? { workspaceId: user.workspace.id } : {}),
          role: user.role,
          customRoleId: user.customRole?.id || null
        })
      })

      const data = await res.json()

      if (!res.ok && !data.emailError) {
        console.error('Erro ao reenviar convite:', data.message)
      }
    } catch (err) {
      console.error('Erro ao reenviar convite:', err)
    } finally {
      setResendingInvite(null)
    }
  }

  const handleConfirmDelete = async () => {
    if (!userToDelete) return

    const res = await fetch(`/api/apps/users/${userToDelete.id}`, { method: 'DELETE' })

    if (res.ok) {
      setData(prev => prev.filter(u => u.id !== userToDelete.id))
      setFilteredData(prev => prev.filter(u => u.id !== userToDelete.id))
    }

    setDeleteDialogOpen(false)
    setUserToDelete(null)
  }

  const columns = useMemo(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            {...{
              checked: table.getIsAllRowsSelected(),
              indeterminate: table.getIsSomeRowsSelected(),
              onChange: table.getToggleAllRowsSelectedHandler()
            }}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            {...{
              checked: row.getIsSelected(),
              disabled: !row.getCanSelect(),
              indeterminate: row.getIsSomeSelected(),
              onChange: row.getToggleSelectedHandler()
            }}
          />
        )
      },
      columnHelper.accessor('name', {
        header: 'Usuário',
        cell: ({ row }) => (
          <div className='flex items-center gap-4'>
            {getAvatar({ avatar: row.original.image, fullName: row.original.name })}
            <div className='flex flex-col'>
              <Typography color='text.primary' className='font-medium'>
                {row.original.name}
              </Typography>
              <Typography variant='body2'>{row.original.email}</Typography>
            </div>
          </div>
        )
      }),
      columnHelper.accessor('role', {
        header: 'Tipo',
        cell: ({ row }) => {
          const roleData = userRoleObj[row.original.role] || userRoleObj.user

          return (
            <div className='flex items-center gap-2'>
              <Icon className={roleData.icon} sx={{ color: `var(--mui-palette-${roleData.color}-main)` }} />
              <Typography className='capitalize' color='text.primary'>
                {row.original.role}
              </Typography>
            </div>
          )
        }
      }),
      columnHelper.accessor('customRole', {
        header: 'Cargo',
        cell: ({ row }) => <Typography color='text.primary'>{row.original.customRole?.name || '—'}</Typography>
      }),
      columnHelper.accessor('workspace', {
        header: 'Empresa',
        cell: ({ row }) => (
          <Typography className='capitalize' color='text.primary'>
            {row.original.workspace?.name || '—'}
          </Typography>
        )
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: ({ row }) => {
          const st = userStatusObj[row.original.status] || userStatusObj.pending

          return <Chip variant='tonal' label={st.label} size='small' color={st.color} className='capitalize' />
        }
      }),
      columnHelper.accessor('lastLoginAt', {
        header: 'Último Login',
        cell: ({ row }) => {
          const lastLogin = row.original.lastLoginAt

          if (!lastLogin) {
            return <Chip variant='tonal' label='Nunca logou' size='small' color='default' />
          }

          const date = new Date(lastLogin)
          const now = new Date()
          const diffMs = now - date
          const diffMin = Math.floor(diffMs / 60000)
          const diffHours = Math.floor(diffMin / 60)
          const diffDays = Math.floor(diffHours / 24)

          let timeSince = null

          if (diffMin < 1) timeSince = 'Agora mesmo'
          else if (diffMin < 60) timeSince = `${diffMin} min atrás`
          else if (diffHours < 24) timeSince = `${diffHours}h atrás`
          else if (diffDays < 30) timeSince = `${diffDays}d atrás`

          const formatted = date.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })

          return (
            <div className='flex flex-col'>
              <Typography color='text.primary' className='font-medium'>
                {formatted}
              </Typography>
              {timeSince && (
                <Typography variant='body2' color='text.secondary'>
                  {timeSince}
                </Typography>
              )}
            </div>
          )
        }
      }),
      columnHelper.accessor('loginActivity', {
        header: 'Atividade',
        enableSorting: false,
        cell: ({ row }) => {
          const lastLogin = row.original.lastLoginAt

          if (!lastLogin) {
            return <Chip variant='tonal' label='Sem registro' size='small' color='default' />
          }

          const diffHours = (new Date() - new Date(lastLogin)) / (1000 * 60 * 60)

          if (diffHours < 1) return <Chip variant='tonal' label='Online recente' size='small' color='success' />
          if (diffHours < 24) return <Chip variant='tonal' label='Hoje' size='small' color='info' />
          if (diffHours < 168) return <Chip variant='tonal' label='Esta semana' size='small' color='warning' />

          return <Chip variant='tonal' label='Inativo' size='small' color='secondary' />
        }
      }),
      columnHelper.accessor('actions', {
        header: 'Ações',
        cell: ({ row }) => {
          const targetRole = row.original.role
          const isSelf = row.original.id === session?.user?.id

          // SubAdmin cannot manage SuperAdmin or SubAdmin targets
          const canManage =
            isHighAdmin && !(callerRole === 'subAdmin' && (targetRole === 'superAdmin' || targetRole === 'subAdmin'))

          return (
            <div className='flex items-center'>
              {canManage && (
                <>
                  {!isSelf && (
                    <IconButton onClick={() => openDeleteDialog(row.original)}>
                      <i className='tabler-trash text-textSecondary' />
                    </IconButton>
                  )}
                  <OptionMenu
                    iconButtonProps={{ size: 'medium' }}
                    iconClassName='text-textSecondary'
                    options={[
                      {
                        text: 'Editar',
                        icon: 'tabler-edit',
                        menuItemProps: {
                          className: 'flex items-center gap-2 text-textSecondary',
                          onClick: () => handleEdit(row.original)
                        }
                      },
                      ...(row.original.status === 'pending'
                        ? [
                            {
                              text: resendingInvite === row.original.id ? 'Reenviando...' : 'Reenviar Convite',
                              icon: 'tabler-mail-forward',
                              menuItemProps: {
                                className: 'flex items-center gap-2 text-textSecondary',
                                disabled: resendingInvite === row.original.id,
                                onClick: () => handleResendInvite(row.original)
                              }
                            }
                          ]
                        : [])
                    ]}
                  />
                </>
              )}
            </div>
          )
        },
        enableSorting: false
      })
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, filteredData, callerRole, isHighAdmin, session]
  )

  const table = useReactTable({
    data: filteredData,
    columns,
    filterFns: {
      fuzzy: fuzzyFilter
    },
    state: {
      rowSelection,
      globalFilter
    },
    initialState: {
      pagination: {
        pageSize: 10
      }
    },
    enableRowSelection: true, //enable row selection for all rows
    // enableRowSelection: row => row.original.age > 18, // or enable row selection conditionally per row
    globalFilterFn: fuzzyFilter,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFacetedMinMaxValues: getFacetedMinMaxValues()
  })

  const getAvatar = params => {
    const { avatar, fullName } = params

    if (avatar) {
      return <CustomAvatar src={avatar} size={34} />
    } else {
      return <CustomAvatar size={34}>{getInitials(fullName)}</CustomAvatar>
    }
  }

  return (
    <>
      <Card>
        <CardHeader title='Filters' className='pbe-4' />
        <TableFilters setData={setFilteredData} tableData={data} workspaces={workspaces || []} />
        <div className='flex justify-between flex-col items-start md:flex-row md:items-center p-6 border-bs gap-4'>
          <CustomTextField
            select
            value={table.getState().pagination.pageSize}
            onChange={e => table.setPageSize(Number(e.target.value))}
            className='max-sm:is-full sm:is-[70px]'
          >
            <MenuItem value='10'>10</MenuItem>
            <MenuItem value='25'>25</MenuItem>
            <MenuItem value='50'>50</MenuItem>
          </CustomTextField>
          <div className='flex flex-col sm:flex-row max-sm:is-full items-start sm:items-center gap-4'>
            <DebouncedInput
              value={globalFilter ?? ''}
              onChange={value => setGlobalFilter(String(value))}
              placeholder='Pesquisar...'
              className='max-sm:is-full'
            />
            {isHighAdmin && (
              <Button
                variant='contained'
                startIcon={<i className='tabler-mail-plus' />}
                onClick={() => setAddUserOpen(!addUserOpen)}
                className='max-sm:is-full'
              >
                Convidar Usuário
              </Button>
            )}
          </div>
        </div>
        <div className='overflow-x-auto'>
          <table className={tableStyles.table}>
            <thead>
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <th key={header.id}>
                      {header.isPlaceholder ? null : (
                        <>
                          <div
                            className={classnames({
                              'flex items-center': header.column.getIsSorted(),
                              'cursor-pointer select-none': header.column.getCanSort()
                            })}
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {{
                              asc: <i className='tabler-chevron-up text-xl' />,
                              desc: <i className='tabler-chevron-down text-xl' />
                            }[header.column.getIsSorted()] ?? null}
                          </div>
                        </>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            {table.getFilteredRowModel().rows.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={table.getVisibleFlatColumns().length} className='text-center'>
                    Sem Data Disponível
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody>
                {table
                  .getRowModel()
                  .rows.slice(0, table.getState().pagination.pageSize)
                  .map(row => {
                    return (
                      <tr key={row.id} className={classnames({ selected: row.getIsSelected() })}>
                        {row.getVisibleCells().map(cell => (
                          <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                        ))}
                      </tr>
                    )
                  })}
              </tbody>
            )}
          </table>
        </div>
        <TablePagination
          component={() => <TablePaginationComponent table={table} />}
          count={table.getFilteredRowModel().rows.length}
          rowsPerPage={table.getState().pagination.pageSize}
          page={table.getState().pagination.pageIndex}
          onPageChange={(_, page) => {
            table.setPageIndex(page)
          }}
        />
      </Card>
      <AddUserDrawer
        open={addUserOpen}
        handleClose={() => setAddUserOpen(!addUserOpen)}
        workspaces={workspaces || []}
        callerRole={callerRole}
        onInviteSent={newUser => {
          if (newUser) {
            setData(prev => [...prev, newUser])
            setFilteredData(prev => [...prev, newUser])
          }
        }}
      />
      {isHighAdmin && (
        <EditUserDrawer
          open={editUserOpen}
          handleClose={() => setEditUserOpen(false)}
          user={editingUser}
          workspaces={workspaces || []}
          callerRole={callerRole}
          callerEmail={session?.user?.email}
          onSave={handleEditSave}
        />
      )}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Confirmar exclusão</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Tem certeza que deseja excluir o usuário <strong>{userToDelete?.name || userToDelete?.email}</strong>? Esta
            ação não pode ser desfeita.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} color='secondary'>
            Cancelar
          </Button>
          <Button onClick={handleConfirmDelete} color='error' variant='contained'>
            Excluir
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

export default UserListTable
