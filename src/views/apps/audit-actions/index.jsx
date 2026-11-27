import AuditLogsTable from '@views/apps/audit-logs/AuditLogsTable'

// O value é o grupo de ações em /api/apps/audit-logs/admin (ACTION_TYPES)
const ACTION_TYPE_OPTIONS = [
  { value: 'errors', label: 'Ações com erro' },
  { value: 'form_submit', label: 'Envios com sucesso' },
  { value: 'form_submit_error', label: 'Envios com erro' },
  { value: 'form_manage', label: 'Gestão de formulários' },
  { value: 'documents', label: 'Documentos' },
  { value: 'dashboards', label: 'Dashboards' },
  { value: 'users', label: 'Usuários e funções' },
  { value: 'workspaces', label: 'Workspaces' },
  { value: 'integrations', label: 'Integrações' }
]

const AuditActionsPageView = () => {
  return (
    <AuditLogsTable
      title='Audit de Ações Críticas'
      subheader='O que foi feito: envios de formulário e mudanças em usuários, workspaces, dashboards, formulários e documentos (SubAdmin e SuperAdmin)'
      endpoint='/api/apps/audit-logs/admin'
      searchLabel='Buscar ação, ID, documento ou formulário'
      typeOptions={ACTION_TYPE_OPTIONS}
    />
  )
}

export default AuditActionsPageView
