import { notFound } from 'next/navigation'

import { prisma } from '@/libs/prisma'
import { getPublicLinkInactiveReason } from '@/libs/formlinkservice'
import FormFillView from '@/views/forms/FormFillView'

export default async function PublicFormPage({ params }) {
  const { token } = await params

  const link = await prisma.formPublicLink.findUnique({
    where: { token },
    include: { form: true }
  })

  if (!link) return notFound()
  const inactiveReason = getPublicLinkInactiveReason(link)

  if (inactiveReason === 'used') {
    return (
      <div className='flex flex-col items-center justify-center min-h-screen gap-4 p-6 text-center'>
        <i className='tabler-link-off text-5xl text-gray-400' />
        <h1 className='text-xl font-semibold text-gray-900 dark:text-gray-100'>Link já utilizado</h1>
        <p className='text-sm text-gray-500'>
          Este link já foi usado e não aceita novos envios.
        </p>
      </div>
    )
  }

  if (inactiveReason === 'expired') {
    return (
      <div className='flex flex-col items-center justify-center min-h-screen gap-4 p-6 text-center'>
        <i className='tabler-clock-off text-5xl text-gray-400' />
        <h1 className='text-xl font-semibold text-gray-900 dark:text-gray-100'>Link expirado</h1>
        <p className='text-sm text-gray-500'>
          Este link expirou em {new Date(link.expiresAt).toLocaleString('pt-BR')} e não aceita respostas.
        </p>
      </div>
    )
  }

  return (
    <div className='min-h-screen bg-gray-50 dark:bg-gray-900 py-10'>
      <FormFillView
        form={{
          ...link.form,
          expiresAt: link.expiresAt
        }}
        publicToken={token}
      />
    </div>
  )
}
