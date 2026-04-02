// Component Imports
import Roles from '@views/apps/roles'
import SuperAdminGuard from '@/hocs/SuperAdminGuard'
import NotAuthorized from '@views/NotAuthorized'

const RolesApp = () => {
  return (
    <SuperAdminGuard fallback={<NotAuthorized />}>
      <Roles />
    </SuperAdminGuard>
  )
}

export default RolesApp
