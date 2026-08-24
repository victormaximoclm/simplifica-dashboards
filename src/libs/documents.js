// libs/documents.js
import { prisma } from '@/libs/prisma'

export const getFolderPath = async folderId => {
  const path = []
  let currentId = folderId

  while (currentId) {
    const folder = await prisma.folder.findUnique({
      where: { id: currentId },
      select: { id: true, name: true, parentId: true }
    })

    if (!folder) break

    path.unshift({ id: folder.id, name: folder.name })
    currentId = folder.parentId
  }

  // remove a própria pasta atual da trilha (ela já aparece separada no breadcrumb)
  return path.slice(0, -1)
}
