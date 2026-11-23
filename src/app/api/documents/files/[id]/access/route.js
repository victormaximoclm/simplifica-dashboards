export const runtime = 'nodejs'

import { createAccessHandlers } from '@/libs/documentAccessHandlers'

// GET/PUT /api/documents/files/:id/access - cargos com acesso ao item (SuperAdmin/SubAdmin)
const handlers = createAccessHandlers('file')

export const GET = handlers.GET
export const PUT = handlers.PUT
