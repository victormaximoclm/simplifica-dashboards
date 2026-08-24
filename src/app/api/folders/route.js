import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/libs/auth'
import { prisma } from '@/libs/prisma'

export async function GET(request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json([], { status: 401 })

  const { searchParams } = new URL(request.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) return NextResponse.json([], { status: 400 })

  const isHighAdmin = ['superAdmin', 'subAdmin'].includes(session.user.role)

  const folders = await prisma.folder.findMany({
    where: {
      workspaceId,
      parentId: null,
      ...(isHighAdmin ? {} : { allowedRoles: { some: { customRoleId: session.user.customRoleId } } })
    },
    include: { _count: { select: { children: true, documents: true } } },
    orderBy: { name: 'asc' }
  })

  return NextResponse.json(folders)
}

export async function POST(request) {
  const session = await getServerSession(authOptions)
  const isHighAdmin = ['superAdmin', 'subAdmin'].includes(session?.user?.role)
  if (!isHighAdmin) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const { workspaceId, parentId, name, roleIds = [] } = await request.json()
  if (!workspaceId || !name) {
    return NextResponse.json({ error: 'workspaceId e name são obrigatórios' }, { status: 400 })
  }

  const folder = await prisma.folder.create({
    data: {
      name,
      workspaceId,
      parentId: parentId ?? null,
      createdById: session.user.id,
      allowedRoles: { create: roleIds.map(customRoleId => ({ customRoleId })) }
    }
  })

  return NextResponse.json(folder, { status: 201 })
}
