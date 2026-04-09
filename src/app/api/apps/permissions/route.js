import { NextResponse } from 'next/server'
import { getRequestId } from '@/libs/logger'

export async function GET(req) {
  const response = NextResponse.json(
    {
      message: 'Endpoint legado descontinuado. Use /api/legacy/apps/permissions.',
      deprecated: true
    },
    { status: 410 }
  )
  response.headers.set('x-request-id', getRequestId(req))
  response.headers.set('x-deprecated-endpoint', 'true')
  return response
}
