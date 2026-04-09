export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getRequestId } from '@/libs/logger'

// Health check para Docker / EasyPanel / load balancer (sem auth, sem DB).
export async function GET(req) {
  const requestId = getRequestId(req)
  const response = NextResponse.json(
    { status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  )
  response.headers.set('x-request-id', requestId)
  return response
}
