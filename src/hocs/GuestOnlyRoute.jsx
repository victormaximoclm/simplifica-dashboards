// Next Imports
import { redirect } from 'next/navigation'

// Third-party Imports
import { getServerSession } from 'next-auth'

// Config Imports
import themeConfig from '@configs/themeConfig'
import { authOptions } from '@/libs/auth'

// Component Imports
import ClearInvalidSession from '@/components/auth/ClearInvalidSession'

// Util Imports
import { getLocalizedUrl } from '@/utils/i18n'
import { prisma } from '@/libs/prisma'

const GuestOnlyRoute = async ({ children, lang }) => {
  const userCount = await prisma.user.count()

  if (userCount === 0) {
    redirect(getLocalizedUrl('/setup', lang))
  }

  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return <>{children}</>
  }

  // Sessão JWT ainda válida: conferir se o usuário ainda existe e está ativo.
  // Se estiver inativado ou removido, NÃO redirecionar para o dashboard (isso gerava loop com AuthGuard → login).
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { status: true }
  })

  if (!dbUser || dbUser.status === 'inactive') {
    return (
      <>
        <ClearInvalidSession lang={lang} reason={!dbUser ? 'removed' : 'inactive'} />
        {children}
      </>
    )
  }

  redirect(getLocalizedUrl(themeConfig.homePageUrl, lang))
}

export default GuestOnlyRoute
