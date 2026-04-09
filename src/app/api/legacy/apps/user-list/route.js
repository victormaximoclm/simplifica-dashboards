import { NextResponse } from 'next/server'
import { db } from '@/fake-db/apps/userList'
import { getRequestId } from '@/libs/logger'

export async function GET(req) {
  const response = NextResponse.json(db)
  response.headers.set('x-request-id', getRequestId(req))
  response.headers.set('x-legacy-endpoint', 'true')
  return response
}
