import AuditLogsTable from './AuditLogsTable'

const AuditLogsPageView = () => {
  return (
    <AuditLogsTable
      title='Audit de Acesso'
      subheader='Logins e acessos a áreas/dashboards (SubAdmin e SuperAdmin)'
      endpoint='/api/apps/audit-logs/access'
    />
  )
}

export default AuditLogsPageView
