import SuperAdminGuard from '@/hocs/SuperAdminGuard'
import NotAuthorized from '@views/NotAuthorized'
import AuditActionsPageView from '@views/apps/audit-actions'

const AuditActionsPage = () => {
  return (
    <SuperAdminGuard fallback={<NotAuthorized />}>
      <AuditActionsPageView />
    </SuperAdminGuard>
  )
}

export default AuditActionsPage

