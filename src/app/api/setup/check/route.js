export const runtime = 'nodejs'
import { NextResponse } from 'next/server'

import { getRequestId, jsonWithRequestId } from '@/libs/logger'
import { prisma } from '@/libs/prisma'

// GET /api/setup/check — Check if initial setup is needed
export async function GET(req) {
  const requestId = getRequestId(req)
  const userCount = await prisma.user.count()

  return jsonWithRequestId({ needsSetup: userCount === 0 }, { requestId })
}
