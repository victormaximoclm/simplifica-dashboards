import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/libs/auth'
import { prisma } from '@/libs/prisma'

const assertHighAdmin = session => ['superAdmin', 'subAdmin'].includes(session?.user?.role)

export async function GET(request, { params }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json(null, { status: 401 })

  const folder = await prisma.folder.findUnique({
    where: { id: params.folderId },
    include: {
      children: { orderBy: { name: 'asc' } },
      documents: { orderBy: { createdAt: 'desc' } },
      allowedRoles: true
    }
  })

  if (!folder) return NextResponse.json(null, { status: 404 })

  const canView =
    assertHighAdmin(session) || folder.allowedRoles.some(r => r.customRoleId === session.user.customRoleId)

  if (!canView) return NextResponse.json(null, { status: 403 })

  return NextResponse.json(folder)
}

export async function PATCH(request, { params }) {
  const session = await getServerSession(authOptions)
  if (!assertHighAdmin(session)) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const { name, roleIds } = await request.json()

  const folder = await prisma.folder.update({
    where: { id: params.folderId },
    data: {
      ...(name && { name }),
      ...(roleIds && {
        allowedRoles: {
          deleteMany: {},
          create: roleIds.map(customRoleId => ({ customRoleId }))
        }
      })
    }
  })

  return NextResponse.json(folder)
}

export async function DELETE(request, { params }) {
  const session = await getServerSession(authOptions)
  if (!assertHighAdmin(session)) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  await prisma.folder.delete({ where: { id: params.folderId } })
  return NextResponse.json({ success: true })
}
