import { redirect } from 'next/navigation'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import SiteView from '@/views/documents/site/SiteView'

// Abre um Site do módulo de Documentos. O acesso é checado pela API (perfil + workspace), como nos demais arquivos.
const DocumentSitePage = async ({ params, searchParams }) => {
  const { lang, id } = await params
  const { page } = await searchParams
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect(`/${lang}/login`)
  }

  return <SiteView siteId={id} initialPageId={typeof page === 'string' && page ? page : null} />
}

export default DocumentSitePage
