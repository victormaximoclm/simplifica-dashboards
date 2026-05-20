// app/[lang]/forms/page.jsx

import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { isHighAdmin } from '@/utils/roleHelpers'
import { prisma } from '@/libs/prisma'
import FormsListView from '@/views/forms/FormsListView'
import {
  buildFormListWhereForRole,
  filterFormsForContext,
  getUserFormContext,
  shouldFilterFormsByContext,
  userHasFormViewerAccess
} from '@/libs/formAccess'
import { resolveFormWorkspaceId } from '@/libs/formWorkspace'
import { canManageForms } from '@/libs/formPermissions'
import { formIconMutedCls, formMutedCls, formTitleCls } from '@/views/forms/formStyles'

const FormsPage = async ({ params }) => {
  const { lang } = await params
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect(`/${lang}/login`)
  }

  const userRole = session.user.role
  let workspaceId = null
  let ctx = {}

  if (isHighAdmin(userRole)) {
    workspaceId = await resolveFormWorkspaceId(session)
  } else if (userRole === 'admin') {
    workspaceId = session.user.workspaceId
    if (!workspaceId) {
      return <EmptyState canManage={canManageForms(userRole)} reason='no-workspace' />
    }
  } else {
    ctx = await getUserFormContext(session.user.id)
    workspaceId = ctx.workspaceId

    if (!workspaceId) {
      return <EmptyState canManage={false} reason='no-workspace' />
    }

    if (!userHasFormViewerAccess(ctx)) {
      return <EmptyState canManage={false} reason='no-custom-role' />
    }
  }

  const where = buildFormListWhereForRole(userRole, workspaceId, ctx)

  let forms = await prisma.form.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      description: true,
      allowPublicLink: true,
      allowedCargos: true,
      allowedRoles: true,
      createdAt: true,
      _count: { select: { publicLinks: true } }
    }
  })

  if (shouldFilterFormsByContext(userRole)) {
    forms = filterFormsForContext(forms, ctx)
  }

  return <FormsListView forms={forms} canManage={canManageForms(userRole)} lang={lang} />
}

const EMPTY_MESSAGES = {
  'no-workspace': 'Seu usuário não está vinculado a um workspace. Entre em contato com o administrador.',
  'no-custom-role':
    'Você precisa de uma função (Custom Role) atribuída para acessar formulários. Peça ao administrador do workspace.',
  default: 'Nenhum formulário encontrado para o seu perfil.'
}

const EmptyState = ({ canManage, reason = 'default' }) => (
  <main className='flex flex-col items-center justify-center min-h-[60vh] gap-4'>
    <i className={`tabler-forms text-6xl ${formIconMutedCls}`} />
    <h4 className={`text-xl font-medium ${formTitleCls}`}>Nenhum formulário disponível</h4>
    <p className={`${formMutedCls} text-center max-w-md`}>
      {canManage
        ? 'Nenhum formulário criado neste workspace.'
        : EMPTY_MESSAGES[reason] ?? EMPTY_MESSAGES.default}
    </p>
  </main>
)

export default FormsPage
