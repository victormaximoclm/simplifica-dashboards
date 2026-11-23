export const runtime = 'nodejs'

import { createAccessHandlers } from '@/libs/documentAccessHandlers'

// GET/PUT /api/documents/folders/:id/access - cargos com acesso ao item (SuperAdmin/SubAdmin)
const handlers = createAccessHandlers('folder')

export const GET = handlers.GET
export const PUT = handlers.PUT
