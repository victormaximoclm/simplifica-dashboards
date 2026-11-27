export const runtime = 'nodejs'

import { createAccessHandlers } from '@/libs/documentAccessHandlers'
import { withActionAudit } from '@/libs/auditedAction'

// GET/PUT /api/documents/folders/:id/access - cargos com acesso ao item (SuperAdmin/SubAdmin)
const handlers = createAccessHandlers('folder')

export const GET = handlers.GET
export const PUT = withActionAudit('DOCUMENT_ACCESS_UPDATE', handlers.PUT)
