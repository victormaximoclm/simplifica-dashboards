export const runtime = 'nodejs'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { createAuditLog } from '@/libs/auditService'
import { getRequestId, jsonWithRequestId, logger } from '@/libs/logger'
import { prisma } from '@/libs/prisma'
import { createHtmlTemplateSchema, parseBody } from '@/libs/validations'
import { resolveDocumentsWorkspace, withDocumentErrorHandling } from '@/libs/documentAccess'
import {
  htmlTemplateInclude,
  isHtmlTemplateNameTaken,
  isUniqueViolation,
  prepareHtmlTemplate,
  readHtmlDocumentBody,
  serializeHtmlTemplate
} from '@/libs/documentHtmlRequest'
import { withActionAudit } from '@/libs/auditedAction'

const nameTaken = requestId =>
  jsonWithRequestId({ message: 'Já existe um template com esse nome neste workspace' }, { status: 409, requestId })

// GET /api/documents/html-templates?workspaceId= - templates do workspace (só quem cria documentos)
async function handleGet(req) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    return jsonWithRequestId({ message: 'Não autorizado' }, { status: 401, requestId })
  }

  const { searchParams } = new URL(req.url)
  const access = await resolveDocumentsWorkspace(session, searchParams.get('workspaceId'), 'create')

  if (!access.ok) {
    logger.warn('document-template-list-denied', { requestId, userId: session.user.id, status: access.status })

    return jsonWithRequestId({ message: access.message }, { status: access.status, requestId })
  }

  const templates = await prisma.documentHtmlTemplate.findMany({
    where: { workspaceId: access.workspace.id },
    include: htmlTemplateInclude,
    orderBy: { name: 'asc' }
  })

  return jsonWithRequestId(
    { data: templates.map(serializeHtmlTemplate), workspace: { id: access.workspace.id, name: access.workspace.name } },
    { headers: { 'Cache-Control': 'private, no-store' }, requestId }
  )
}

// POST /api/documents/html-templates - cria template HTML do workspace (SuperAdmin/SubAdmin)
async function handlePost(req) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    return jsonWithRequestId({ message: 'Não autorizado' }, { status: 401, requestId })
  }

  const { body, tooLarge } = await readHtmlDocumentBody(req)

  if (tooLarge) {
    return jsonWithRequestId({ message: 'O template deve ter no máximo 512 KB' }, { status: 413, requestId })
  }

  const parsed = parseBody(createHtmlTemplateSchema, body)

  if (!parsed.success) {
    return jsonWithRequestId({ message: parsed.message }, { status: 400, requestId })
  }

  // Perfil e workspace antes de validar o HTML: quem não pode criar recebe 403
  const access = await resolveDocumentsWorkspace(session, parsed.data.workspaceId, 'create')

  if (!access.ok) {
    logger.warn('document-template-create-denied', { requestId, userId: session.user.id, status: access.status })

    return jsonWithRequestId({ message: access.message }, { status: access.status, requestId })
  }

  const prepared = prepareHtmlTemplate(parsed.data.html)

  if (!prepared.html) {
    return jsonWithRequestId({ message: prepared.message }, { status: prepared.status, requestId })
  }

  const { workspace } = access
  const { name } = parsed.data

  if (await isHtmlTemplateNameTaken(workspace.id, name)) return nameTaken(requestId)

  let template

  try {
    template = await prisma.documentHtmlTemplate.create({
      data: { workspaceId: workspace.id, name, html: prepared.html, createdById: session.user.id },
      include: htmlTemplateInclude
    })
  } catch (error) {
    if (isUniqueViolation(error)) return nameTaken(requestId)

    throw error
  }

  logger.info('document-template-create-success', { requestId, userId: session.user.id, templateId: template.id })
  await createAuditLog({
    userId: session.user.id,
    tenantId: workspace.id,
    action: 'DOCUMENT_TEMPLATE_CREATE',
    resource: 'document_html_template',
    resourceId: template.id,
    after: { name, size: prepared.html.length },
    metadata: { requestId },
    requestId
  })

  return jsonWithRequestId({ data: serializeHtmlTemplate(template) }, { status: 201, requestId })
}

export const GET = withDocumentErrorHandling('document-template-list-unhandled-error', handleGet)
export const POST = withActionAudit(
  'DOCUMENT_TEMPLATE_CREATE',
  withDocumentErrorHandling('document-template-create-unhandled-error', handlePost)
)
