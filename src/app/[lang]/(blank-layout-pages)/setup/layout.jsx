import { redirect } from 'next/navigation'

import { i18n } from '@configs/i18n'
import { getLocalizedUrl } from '@/utils/i18n'
import { prisma } from '@/libs/prisma'

const SetupLayout = async props => {
  const params = await props.params
  const { children } = props

  const lang = i18n.locales.includes(params.lang) ? params.lang : i18n.defaultLocale

  // If any user exists, setup is done — redirect to login
  const userCount = await prisma.user.count()

  if (userCount > 0) {
    redirect(getLocalizedUrl('/login', lang))
  }

  return <>{children}</>
}

export default SetupLayout
