// app/[lang]/forms/[id]/edit/page.jsx

import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { isHighAdmin } from '@/utils/roleHelpers'
import { prisma } from '@/libs/prisma'
import FormBuilder from '@/views/forms/builder/FormBuilder'
import { canManageFormInWorkspace, listCustomRolesForForms, resolveFormWorkspaceId } from '@/libs/formWorkspace'

const FormEditPage = async ({ params }) => {
  const { lang, id } = await params
  const session = await getServerSession(authOptions)

  if (!session) redirect(`/${lang}/login`)

  if (!isHighAdmin(session.user.role)) redirect(`/${lang}/forms`)

  let form = null

  if (id !== 'new') {
    form = await prisma.form.findUnique({
      where: { id },
      include: { _count: { select: { publicLinks: true } } }
    })

    if (!form) redirect(`/${lang}/forms`)

    if (!canManageFormInWorkspace(session, form.workspaceId)) {
      redirect(`/${lang}/forms`)
    }
  }

  const workspaceId = await resolveFormWorkspaceId(session, form?.workspaceId)

  if (!workspaceId) {
    redirect(`/${lang}/forms`)
  }

  const customRoles = await listCustomRolesForForms()

  return (
    <FormBuilder form={form} workspaceId={workspaceId} customRoles={customRoles} lang={lang} />
  )
}

export default FormEditPage
