import SuperAdminGuard from '@/hocs/SuperAdminGuard'
import NotAuthorized from '@views/NotAuthorized'
import AuditLogsPageView from '@views/apps/audit-logs'

const AuditLogsPage = () => {
  return (
    <SuperAdminGuard fallback={<NotAuthorized />}>
      <AuditLogsPageView />
    </SuperAdminGuard>
  )
}

export default AuditLogsPage
