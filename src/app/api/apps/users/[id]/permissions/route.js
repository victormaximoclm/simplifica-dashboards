import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { getRequestId } from '@/libs/logger'
import { isHighAdmin } from '@/utils/roleHelpers'
import { prisma } from '@/libs/prisma'

export async function GET(req, { params }) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  const headers = {
    'x-request-id': requestId
  }

  if (!session) {
    return NextResponse.json(
      { message: 'Não autorizado' },
      {
        status: 401,
        headers
      }
    )
  }

  if (!isHighAdmin(session.user.role)) {
    return NextResponse.json(
      { message: 'Acesso negado' },
      {
        status: 403,
        headers
      }
    )
  }

  const { id } = await params

  const targetUser = await prisma.user.findUnique({
    where: {
      id
    },
    select: {
      id: true,
      role: true,
      email: true
    }
  })

  if (!targetUser) {
    return NextResponse.json(
      { message: 'Usuário não encontrado' },
      {
        status: 404,
        headers
      }
    )
  }

  if (targetUser.role !== 'admin') {
    return NextResponse.json(
      { message: 'Somente usuários Admin podem ter permissões alteradas' },
      {
        status: 403,
        headers
      }
    )
  }

  const permissions = await prisma.adminPermission.findMany({
    where: {
      userId: id
    },
    select: {
      moduleKey: true,
      action: true
    }
  })

  return NextResponse.json(permissions, {
    headers
  })
}

export async function PUT(req, { params }) {
  try {
    const requestId = getRequestId(req)
    const session = await getServerSession(authOptions)

    const headers = {
      'x-request-id': requestId
    }

    if (!session) {
      return NextResponse.json(
        { message: 'Não autorizado' },
        {
          status: 401,
          headers
        }
      )
    }

    if (!isHighAdmin(session.user.role)) {
      return NextResponse.json(
        { message: 'Acesso negado' },
        {
          status: 403,
          headers
        }
      )
    }

    const { id } = await params

    const targetUser = await prisma.user.findUnique({
      where: {
        id
      },
      select: {
        id: true,
        role: true,
        email: true
      }
    })

    if (!targetUser) {
      return NextResponse.json(
        {
          message: 'Usuário não encontrado'
        },
        {
          status: 404,
          headers
        }
      )
    }

    if (targetUser.role !== 'admin') {
      return NextResponse.json(
        {
          message: 'Somente usuários Admin podem ter permissões alteradas'
        },
        {
          status: 403,
          headers
        }
      )
    }

    const body = await req.json()

    const { permissions } = body

    if (!Array.isArray(permissions)) {
      return NextResponse.json(
        {
          message: 'permissions deve ser um array'
        },
        {
          status: 400,
          headers
        }
      )
    }

    const allowedActions = ['share']

    const invalidPermission = permissions.some(permission => {
      return (
        !permission.moduleKey ||
        typeof permission.moduleKey !== 'string' ||
        !permission.action ||
        !allowedActions.includes(permission.action)
      )
    })

    if (invalidPermission) {
      return NextResponse.json(
        {
          message: 'Permissão inválida'
        },
        {
          status: 400,
          headers
        }
      )
    }

    await prisma.$transaction(async tx => {
      await tx.adminPermission.deleteMany({
        where: {
          userId: id
        }
      })

      if (permissions.length) {
        await tx.adminPermission.createMany({
          data: permissions.map(permission => ({
            userId: id,
            moduleKey: permission.moduleKey,
            action: permission.action
          }))
        })
      }
    })

    const updatedPermissions = await prisma.adminPermission.findMany({
      where: {
        userId: id
      },
      select: {
        moduleKey: true,
        action: true
      }
    })

    return NextResponse.json(
      {
        message: 'Permissões atualizadas com sucesso',
        permissions: updatedPermissions
      },
      {
        headers
      }
    )
  } catch (error) {
    console.error('ADMIN PERMISSION PUT ERROR:', error)

    return NextResponse.json(
      {
        message: 'Erro interno ao atualizar permissões'
      },
      {
        status: 500
      }
    )
  }
}
