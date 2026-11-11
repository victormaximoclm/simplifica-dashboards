import AuditLogsTable from '@views/apps/audit-logs/AuditLogsTable'

const AuditActionsPageView = () => {
  return (
    <AuditLogsTable
      title='Audit de Ações Críticas'
      subheader='Ações administrativas em usuários, workspaces e documentos, incluindo quem abriu e baixou cada arquivo (SubAdmin e SuperAdmin)'
      endpoint='/api/apps/audit-logs/admin'
      searchLabel='Buscar ação, ID ou documento'
    />
  )
}

export default AuditActionsPageView
