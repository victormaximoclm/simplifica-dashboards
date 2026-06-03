// app/f/[token]/page.jsx — preenchimento público (sem auth)

import { prisma } from '@/libs/prisma'
import { getPublicLinkInactiveReason } from '@/libs/formlinkservice'
import FormFillView from '@/views/forms/FormFillView'

const PublicFormPage = async ({ params }) => {
  const { token } = await params

  const publicLink = await prisma.formPublicLink.findUnique({
    where: { token },
    include: { form: { include: { workspace: true } } }
  })

  if (!publicLink) {
    return (
      <main className='min-h-screen flex items-center justify-center p-6'>
        <p className='text-red-500 text-center'>Link inválido</p>
      </main>
    )
  }

  const inactiveReason = getPublicLinkInactiveReason(publicLink)

  if (inactiveReason === 'used') {
    return (
      <main className='min-h-screen flex items-center justify-center p-6'>
        <p className='text-red-500 text-center'>Link já utilizado. Não é possível enviar outra resposta.</p>
      </main>
    )
  }

  if (inactiveReason === 'expired') {
    return (
      <main className='min-h-screen flex items-center justify-center p-6'>
        <p className='text-red-500 text-center'>Link expirado. Não é possível enviar respostas.</p>
      </main>
    )
  }

  const { form } = publicLink

  return (
    <main className='min-h-screen bg-gray-50 dark:bg-gray-950 py-8'>
      <FormFillView
        form={{
          id: form.id,
          title: form.title,
          description: form.description,
          fields: form.fields,
          workspaceId: form.workspaceId,
          expiresAt: publicLink.expiresAt,
          pagination: form.pagination
        }}
        publicToken={token}
      />
    </main>
  )
}

export default PublicFormPage
