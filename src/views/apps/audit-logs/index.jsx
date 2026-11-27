import AuditLogsTable from './AuditLogsTable'

// O value é o grupo de ações em /api/apps/audit-logs/access (ACCESS_TYPES)
const ACCESS_TYPE_OPTIONS = [
  { value: 'login', label: 'Logins' },
  { value: 'dashboard', label: 'Dashboards' },
  { value: 'file_view', label: 'Arquivos visualizados' },
  { value: 'file_download', label: 'Arquivos baixados' }
]

const AuditLogsPageView = () => {
  return (
    <AuditLogsTable
      title='Audit de Acesso'
      subheader='Quem entrou, viu dashboards e abriu ou baixou arquivos (SubAdmin e SuperAdmin)'
      endpoint='/api/apps/audit-logs/access'
      searchLabel='Buscar ação, ID ou arquivo'
      typeOptions={ACCESS_TYPE_OPTIONS}
    />
  )
}

export default AuditLogsPageView
