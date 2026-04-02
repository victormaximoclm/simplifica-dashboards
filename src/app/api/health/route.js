export const runtime = 'nodejs'

import { NextResponse } from 'next/server'

// Health check para Docker / EasyPanel / load balancer (sem auth, sem DB).
export async function GET() {
  return NextResponse.json(
    { status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  )
}
