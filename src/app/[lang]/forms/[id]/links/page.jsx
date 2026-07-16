// app/[lang]/forms/[id]/links/page.jsx

import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { isHighAdmin } from '@/utils/roleHelpers'
import { prisma } from '@/libs/prisma'
import { canNonHighAdminAccessForm, getUserFormContext } from '@/libs/formAccess'
import { canGeneratePublicLinksInFill, canGeneratePublicLinks } from '@/libs/formPermissions'
import FormLinksView from '@/views/forms/FormLinksView'

const FormLinksPage = async ({ params }) => {
  const { lang, id } = await params
  const session = await getServerSession(authOptions)

  if (!session) redirect(`/${lang}/login`)

  const form = await prisma.form.findUnique({
    where: { id },
    select: { id: true, title: true, workspaceId: true, allowPublicLink: true, allowedCargos: true, allowedRoles: true }
  })

  if (!form) redirect(`/${lang}/forms`)

  if (!form.allowPublicLink) redirect(`/${lang}/forms`)

  const role = session.user.role

  const ctx = role !== 'admin' && !isHighAdmin(role) ? await getUserFormContext(session.user.id) : {}

  if (!isHighAdmin(role)) {
    if (form.workspaceId !== session.user.workspaceId) {
      redirect(`/${lang}/forms`)
    }

    if (!canNonHighAdminAccessForm(role, form, ctx)) {
      redirect(`/${lang}/forms`)
    }
  }

  const canGenerateLink = isHighAdmin(role)
    ? await canGeneratePublicLinks(role)
    : await canGeneratePublicLinksInFill(role, form, ctx)

  return <FormLinksView formId={form.id} formTitle={form.title} lang={lang} canGenerateLink={canGenerateLink} />
}

export default FormLinksPage
