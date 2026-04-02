export const runtime = 'nodejs'
import { NextResponse } from 'next/server'

import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'

import { prisma } from '@/libs/prisma'
import { setupLimiter } from '@/libs/rateLimit'
import { setupSchema, parseBody } from '@/libs/validations'

// POST /api/setup — Create the first super admin (only if no users exist)
export async function POST(req) {
  const { success } = setupLimiter.check(req)

  if (!success) {
    return NextResponse.json({ message: 'Muitas tentativas. Aguarde um momento.' }, { status: 429 })
  }

  const parsed = parseBody(setupSchema, await req.json())

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.message }, { status: 400 })
  }

  const { name, email, password } = parsed.data

  const hashedPassword = await bcrypt.hash(password, 10)

  let user = null

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      user = await prisma.$transaction(
        async tx => {
          // Block if any user already exists (checked inside tx to avoid race conditions)
          const userCount = await tx.user.count()

          if (userCount > 0) {
            throw new Error('SETUP_ALREADY_DONE')
          }

          return tx.user.create({
            data: {
              name: name.trim(),
              email: email.trim().toLowerCase(),
              password: hashedPassword,
              role: 'superAdmin',
              status: 'active'
            }
          })
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable
        }
      )

      break
    } catch (error) {
      if (error.message === 'SETUP_ALREADY_DONE') {
        return NextResponse.json({ message: 'A configuração inicial já foi realizada.' }, { status: 403 })
      }

      // Retry once Prisma reports serialization conflict
      if (error.code === 'P2034' && attempt < 2) {
        continue
      }

      throw error
    }
  }

  if (!user) {
    return NextResponse.json({ message: 'Não foi possível concluir a configuração inicial.' }, { status: 409 })
  }

  return NextResponse.json({ message: 'Super Admin criado com sucesso!', userId: user.id }, { status: 201 })
}
