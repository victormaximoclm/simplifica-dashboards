import { NextResponse } from 'next/server'

import { prisma } from '@/libs/prisma'

// GET /api/setup/check — Check if initial setup is needed
export async function GET() {
  const userCount = await prisma.user.count()

  return NextResponse.json({ needsSetup: userCount === 0 })
}
