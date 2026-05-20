import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { isHighAdmin } from '@/utils/roleHelpers'
import { prisma } from '@/libs/prisma'
import { canAccessForm, getUserFormContext } from '@/libs/formAccess'
import FormFillView from '@/views/forms/FormFillView'
import { canGeneratePublicLinksInFill } from '@/libs/formPermissions'

const FormFillPage = async ({ params }) => {
  const { lang, id } = await params
  const session = await getServerSession(authOptions)

  if (!session) redirect(`/${lang}/login`)

  const role = session.user.role

  const form = await prisma.form.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      fields: true,
      workspaceId: true,
      allowedCargos: true,
      allowedRoles: true,
      allowPublicLink: true
    }
  })

  if (!form) redirect(`/${lang}/forms`)

  if (!isHighAdmin(role)) {
    if (form.workspaceId !== session.user.workspaceId) redirect(`/${lang}/forms`)
  }

  let ctx = {}
  if (role !== 'admin' && !isHighAdmin(role)) {
    ctx = await getUserFormContext(session.user.id)
    if (!canAccessForm(form, ctx)) redirect(`/${lang}/forms`)
  }

  const canManage = canGeneratePublicLinksInFill(role, form, ctx)

  return <FormFillView form={form} canManage={canManage} lang={lang} />
}

export default FormFillPage
