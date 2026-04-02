/**
 * ! The server actions below are used to fetch the static data from the fake-db. If you're using an ORM
 * ! (Object-Relational Mapping) or a database, you can swap the code below with your own database queries.
 */
'use server'

// Third-party Imports
import { getServerSession } from 'next-auth'

// Data Imports
import { db as permissionData } from '@/fake-db/apps/permissions'
import { db as profileData } from '@/fake-db/pages/userProfile'
import { authOptions } from '@/libs/auth'
import { prisma } from '@/libs/prisma'
import { isHighAdmin } from '@/utils/roleHelpers'

export const getUserData = async () => {
  const session = await getServerSession(authOptions)

  if (!session) return []

  const where = isHighAdmin(session.user.role) ? {} : { workspaceId: session.user.workspaceId }

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      status: true,
      lastLoginAt: true,
      workspace: { select: { id: true, name: true } },
      customRole: { select: { id: true, name: true } }
    },
    orderBy: { name: 'asc' }
  })

  return users
}

export const getUserStats = async () => {
  const session = await getServerSession(authOptions)

  if (!session) return { totalUsers: 0, totalWorkspaces: 0, activeUsers: 0, pendingUsers: 0 }

  const highAdmin = isHighAdmin(session.user.role)
  const where = highAdmin ? {} : { workspaceId: session.user.workspaceId }

  const [totalUsers, activeUsers, pendingUsers, totalWorkspaces] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.count({ where: { ...where, status: 'active' } }),
    prisma.user.count({ where: { ...where, status: 'pending' } }),
    highAdmin ? prisma.workspace.count() : Promise.resolve(1)
  ])

  return { totalUsers, totalWorkspaces, activeUsers, pendingUsers }
}

export const getPermissionsData = async () => {
  return permissionData
}

export const getProfileData = async () => {
  return profileData
}

// ==================== Workspace Server Actions ====================

export const getWorkspaces = async () => {
  const session = await getServerSession(authOptions)

  if (!session) return []

  if (!isHighAdmin(session.user.role)) {
    // Regular user: return only their workspace
    if (!session.user.workspaceId) return []

    const workspace = await prisma.workspace.findUnique({
      where: { id: session.user.workspaceId },
      include: { _count: { select: { users: true } } }
    })

    return workspace ? [workspace] : []
  }

  // High admin (superAdmin/subAdmin): return all workspaces
  return prisma.workspace.findMany({
    include: { _count: { select: { users: true } } },
    orderBy: { createdAt: 'desc' }
  })
}

export const getWorkspaceById = async id => {
  const session = await getServerSession(authOptions)

  if (!session) return null

  if (!isHighAdmin(session.user.role) && session.user.workspaceId !== id) {
    return null
  }

  return prisma.workspace.findUnique({
    where: { id },
    include: {
      users: {
        select: { id: true, name: true, email: true, role: true, image: true }
      }
    }
  })
}

export const getCurrentUserWorkspace = async () => {
  const session = await getServerSession(authOptions)

  if (!session || !session.user.workspaceId) return null

  return prisma.workspace.findUnique({
    where: { id: session.user.workspaceId }
  })
}

// ==================== Account Settings Server Actions ====================

export const getCurrentUser = async () => {
  const session = await getServerSession(authOptions)

  if (!session) return null

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      workspace: {
        select: { id: true, name: true }
      }
    }
  })

  return user
}
