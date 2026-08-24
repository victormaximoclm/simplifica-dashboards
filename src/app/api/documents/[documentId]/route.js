import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/libs/auth'
import { prisma } from '@/libs/prisma'
import { canUploadDocuments } from '@/libs/adminPermissions'

export async function DELETE(request, { params }) {
  const session = await getServerSession(authOptions)
  const isHighAdmin = ['superAdmin', 'subAdmin'].includes(session?.user?.role)
  const canManage = isHighAdmin || canUploadDocuments(session?.user?.adminPermissions ?? [])

  if (!canManage) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  await prisma.document.delete({ where: { id: params.documentId } })
  return NextResponse.json({ success: true })
}
