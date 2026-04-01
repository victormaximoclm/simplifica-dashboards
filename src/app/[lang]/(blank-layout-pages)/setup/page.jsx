// Component Imports
import Setup from '@views/Setup'

// Server Action Imports
import { getServerMode } from '@core/utils/serverHelpers'

export const metadata = {
  title: 'Configuração Inicial - Simplifica Dashboards',
  description: 'Crie a conta de Super Administrador'
}

const SetupPage = async () => {
  const mode = await getServerMode()

  return <Setup mode={mode} />
}

export default SetupPage
