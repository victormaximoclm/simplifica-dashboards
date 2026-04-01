// Component Imports
import AcceptInvite from '@views/AcceptInvite'

// Server Action Imports
import { getServerMode } from '@core/utils/serverHelpers'

export const metadata = {
  title: 'Aceitar Convite',
  description: 'Aceite o convite e crie sua conta'
}

const AcceptInvitePage = async () => {
  const mode = await getServerMode()

  return <AcceptInvite mode={mode} />
}

export default AcceptInvitePage
