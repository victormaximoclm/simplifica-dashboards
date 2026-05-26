// Component Imports
import Setup from '@views/Setup'

// Server Action Imports
import { getServerMode } from '@core/utils/serverHelpers'

export const metadata = {
  title: 'Configuração Inicial - Simpla Insights',
  description: 'Crie a conta de Super Administrador'
}

const SetupPage = async () => {
  const mode = await getServerMode()

  return <Setup mode={mode} />
}

export default SetupPage
