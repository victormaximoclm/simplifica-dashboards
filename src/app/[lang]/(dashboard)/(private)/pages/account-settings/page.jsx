// Component Imports
import AccountSettings from '@views/pages/account-settings'

// Data Imports
import { getCurrentUser } from '@/app/server/actions'

const AccountSettingsPage = async () => {
  const userData = await getCurrentUser()

  return <AccountSettings userData={userData} />
}

export default AccountSettingsPage
