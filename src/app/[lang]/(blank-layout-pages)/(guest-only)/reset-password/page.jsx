// Component Imports
import ResetPassword from '@views/ResetPassword'

// Server Action Imports
import { getServerMode } from '@core/utils/serverHelpers'

export const metadata = {
  title: 'Redefinir senha',
  description: 'Redefinir senha'
}

const ResetPasswordPage = async () => {
  // Vars
  const mode = await getServerMode()

  return <ResetPassword mode={mode} />
}

export default ResetPasswordPage
