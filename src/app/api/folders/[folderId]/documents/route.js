import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/libs/auth'
import { prisma } from '@/libs/prisma'
import { canUploadDocuments } from '@/libs/adminPermissions'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

export async function GET(request, { params }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json([], { status: 401 })

  const isHighAdmin = ['superAdmin', 'subAdmin'].includes(session.user.role)

  const folder = await prisma.folder.findUnique({
    where: { id: params.folderId },
    include: { allowedRoles: true }
  })

  if (!folder) return NextResponse.json([], { status: 404 })

  const canView = isHighAdmin || folder.allowedRoles.some(r => r.customRoleId === session.user.customRoleId)
  if (!canView) return NextResponse.json([], { status: 403 })

  const documents = await prisma.document.findMany({
    where: { folderId: params.folderId },
    orderBy: { createdAt: 'desc' }
  })

  return NextResponse.json(documents)
}

export async function POST(request, { params }) {
  const session = await getServerSession(authOptions)
  const isHighAdmin = ['superAdmin', 'subAdmin'].includes(session?.user?.role)
  const canUpload = isHighAdmin || canUploadDocuments(session?.user?.adminPermissions ?? [])

  if (!canUpload) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const folder = await prisma.folder.findUnique({ where: { id: params.folderId } })
  if (!folder) return NextResponse.json({ error: 'Pasta não encontrada' }, { status: 404 })

  const formData = await request.formData()
  const file = formData.get('file')

  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })
  }

  // Limite de teste: 20MB
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: 'Arquivo maior que 20MB' }, { status: 400 })
  }

  const uploadDir = path.join(process.cwd(), 'public', 'uploads', folder.workspaceId, params.folderId)
  await mkdir(uploadDir, { recursive: true })

  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
  const uniqueName = `${Date.now()}-${safeName}`
  const filePath = path.join(uploadDir, uniqueName)

  const bytes = Buffer.from(await file.arrayBuffer())
  await writeFile(filePath, bytes)

  const fileUrl = `/uploads/${folder.workspaceId}/${params.folderId}/${uniqueName}`

  const document = await prisma.document.create({
    data: {
      name: file.name,
      fileUrl,
      mimeType: file.type || null,
      size: file.size,
      workspaceId: folder.workspaceId,
      folderId: params.folderId,
      uploadedById: session.user.id
    }
  })

  return NextResponse.json(document, { status: 201 })
}
