import AuditLogsTable from '@views/apps/audit-logs/AuditLogsTable'

const AuditActionsPageView = () => {
  return (
    <AuditLogsTable
      title='Audit de Ações Críticas'
      subheader='Ações administrativas em usuários e workspaces (SubAdmin e SuperAdmin)'
      endpoint='/api/apps/audit-logs/admin'
    />
  )
}

export default AuditActionsPageView

