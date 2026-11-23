import { Readable } from 'stream'

import { createDedupedAuditLog } from '@/libs/auditService'
import { getRequestId, jsonWithRequestId, logger } from '@/libs/logger'
import { prisma } from '@/libs/prisma'
import * as storage from '@/libs/storage'
import { canAccessWorkspace, canCreateWorkspaceContent, canManageWorkspaceContent } from '@/utils/roleHelpers'
import {
  getFirstAccessibleWorkspace,
  loadWorkspaceForAccess,
  resolveModuleWorkspaceScope
} from '@/libs/workspaceAccess'
import { canCreateDocuments, canDeleteDocuments, canEditDocuments, canViewDocuments } from '@/libs/documentPermissions'
import { canViewerSeeItem, getDocumentViewer } from '@/libs/documentGrants'
import {
  DOCUMENT_DEFAULT_MAX_FILE_SIZE_MB,
  HTML_DOCUMENT_MIME,
  getDocumentFileType,
  isSiteMime,
  getFileExtension,
  isPreviewableMime,
  isUploadableFileType
} from '@/libs/documentFileTypes'
import { HTML_DOCUMENT_CSP } from '@/libs/documentHtml'

export const MAX_FOLDER_DEPTH = 10
export const MAX_FILES_PER_UPLOAD = 20

/** Teto do DOCUMENTS_MAX_FILE_SIZE_MB: precisa caber em experimental.proxyClientMaxBodySize (next.config.mjs) */
const MAX_FILE_SIZE_CAP_MB = 50

/** Limite total de uma requisição de upload (mesmo valor de proxyClientMaxBodySize: teto + folga do multipart) */
export const DOCUMENTS_MAX_REQUEST_BYTES = 55 * 1024 * 1024

/** Limite por arquivo em MB inteiros (o mesmo valor é repassado ao client pela página) */
export function getMaxFileSizeMb() {
  const value = Math.floor(Number(process.env.DOCUMENTS_MAX_FILE_SIZE_MB))

  if (!Number.isFinite(value) || value < 1) return DOCUMENT_DEFAULT_MAX_FILE_SIZE_MB

  return Math.min(value, MAX_FILE_SIZE_CAP_MB)
}

export function getMaxFileSizeBytes() {
  return getMaxFileSizeMb() * 1024 * 1024
}

/** Item sem blob no storage (storageKey nulo, como o Site): não há conteúdo para ler, baixar ou pré-visualizar */
export class DocumentNoContentError extends Error {
  constructor(message = 'Este item não tem conteúdo de arquivo') {
    super(message)
    this.name = 'DocumentNoContentError'
  }
}

/**
 * Envolve um handler de rota do módulo: exceções não tratadas (banco/storage fora dos try/catch locais)
 * viram 500 com logger.error e x-request-id, em vez do erro genérico do Next.
 * `DocumentNoContentError` vira 415 (uma rota de conteúdo que esqueça de checar o tipo não responde 500).
 */
export function withDocumentErrorHandling(event, handler) {
  return async (req, context) => {
    try {
      return await handler(req, context)
    } catch (error) {
      const requestId = getRequestId(req)

      if (error instanceof DocumentNoContentError) {
        return jsonWithRequestId({ message: error.message }, { status: 415, requestId })
      }

      logger.error(event, { requestId, error: error instanceof Error ? error.message : String(error) })

      return jsonWithRequestId({ message: 'Erro interno ao processar a solicitação' }, { status: 500, requestId })
    }
  }
}

// ── Regras de acesso (perfil + workspace) ───

const ACTION_RULES = {
  view: { profile: canViewDocuments, workspace: canAccessWorkspace },
  download: { profile: canViewDocuments, workspace: canAccessWorkspace },
  create: { profile: canCreateDocuments, workspace: canCreateWorkspaceContent },
  edit: { profile: canEditDocuments, workspace: canManageWorkspaceContent },
  delete: { profile: canDeleteDocuments, workspace: canManageWorkspaceContent }
}

export function canPerformDocumentAction(user, workspace, action) {
  const rule = ACTION_RULES[action]

  return !!rule && rule.profile(user) && rule.workspace(user, workspace)
}

/** Permissões efetivas do usuário no workspace (usadas pela UI para esconder botões) */
export function getDocumentPermissions(user, workspace) {
  return {
    canCreate: canPerformDocumentAction(user, workspace, 'create'),
    canEdit: canPerformDocumentAction(user, workspace, 'edit'),
    canDelete: canPerformDocumentAction(user, workspace, 'delete')
  }
}

/**
 * Resolve o workspace de uma operação de listagem/criação.
 * Ordem: perfil (403) → escopo/workspace (404/403) → regra do workspace para a ação (403).
 */
export async function resolveDocumentsWorkspace(session, requestedWorkspaceId, action = 'view') {
  if (!ACTION_RULES[action].profile(session.user)) {
    return { ok: false, status: 403, message: 'Acesso negado' }
  }

  const scope = await resolveModuleWorkspaceScope(session, requestedWorkspaceId || null)

  if (scope.error) {
    return { ok: false, status: scope.error.status, message: scope.error.message }
  }

  let workspace = scope.workspace ?? null

  if (!workspace && scope.workspaceId) {
    workspace = await loadWorkspaceForAccess(scope.workspaceId)
  }

  if (!workspace && !scope.workspaceId) {
    const first = await getFirstAccessibleWorkspace(session)

    workspace = first ? await loadWorkspaceForAccess(first.id) : null
  }

  if (!workspace) {
    return { ok: false, status: 404, message: 'Workspace não encontrado' }
  }

  if (!ACTION_RULES[action].workspace(session.user, workspace)) {
    return { ok: false, status: 403, message: 'Acesso negado a este workspace' }
  }

  return { ok: true, workspace }
}

/**
 * Carrega uma pasta ou arquivo e valida perfil + workspace para a ação.
 * Retorna { ok, status, message, item, workspace }.
 */
export async function getAuthorizedDocumentItem({ kind, id, session, action }) {
  if (!session) {
    return { ok: false, status: 401, message: 'Não autorizado' }
  }

  if (!ACTION_RULES[action].profile(session.user)) {
    return { ok: false, status: 403, message: 'Acesso negado' }
  }

  const delegate = kind === 'folder' ? prisma.documentFolder : prisma.documentFile
  const item = await delegate.findUnique({ where: { id }, include: documentCreatorInclude })

  if (!item) {
    return { ok: false, status: 404, message: kind === 'folder' ? 'Pasta não encontrada' : 'Arquivo não encontrado' }
  }

  const workspace = await loadWorkspaceForAccess(item.workspaceId)

  if (!workspace || !ACTION_RULES[action].workspace(session.user, workspace)) {
    return { ok: false, status: 403, message: 'Acesso negado a este workspace' }
  }

  // Ver e baixar dependem também dos cargos liberados na pasta/arquivo (documentGrants.js). Sem acesso: mesma
  // resposta de antes, sem revelar nada do item. Baixar é uma permissão à parte: quem só vê não baixa. As demais
  // ações já são só de SuperAdmin/SubAdmin.
  if (action === 'view' || action === 'download') {
    const viewer = await getDocumentViewer(session.user, workspace)

    if (!canViewerSeeItem(viewer, kind, item)) {
      return { ok: false, status: 403, message: 'Acesso negado' }
    }

    if (action === 'download' && (kind !== 'file' || !viewer.canDownloadFile(item))) {
      return { ok: false, status: 403, message: 'Você não tem permissão para baixar este arquivo' }
    }

    return { ok: true, item, workspace, viewer }
  }

  return { ok: true, item, workspace }
}

// ── Árvore de pastas ────────────────────────

/** Pasta do workspace informado, ou null */
export async function findFolderInWorkspace(folderId, workspaceId, client = prisma) {
  if (!folderId) return null

  return client.documentFolder.findFirst({
    where: { id: folderId, workspaceId },
    select: { id: true, name: true, parentId: true }
  })
}

/** Caminho da raiz até a pasta (inclusive): [{ id, name }]. Seu tamanho é a profundidade da pasta. */
export async function getFolderPath(folderId, client = prisma) {
  const path = []
  let currentId = folderId

  while (currentId && path.length <= MAX_FOLDER_DEPTH * 2) {
    const folder = await client.documentFolder.findUnique({
      where: { id: currentId },
      select: { id: true, name: true, parentId: true }
    })

    if (!folder) break

    path.unshift({ id: folder.id, name: folder.name })
    currentId = folder.parentId
  }

  return path
}

/** Ids da pasta e de todas as descendentes, e a altura da subárvore (a própria pasta = 1) */
export async function getFolderSubtree(folderId, client = prisma) {
  const ids = [folderId]
  let level = [folderId]
  let height = 1

  while (level.length && height <= MAX_FOLDER_DEPTH * 2) {
    const children = await client.documentFolder.findMany({
      where: { parentId: { in: level } },
      select: { id: true }
    })

    level = children.map(child => child.id)

    if (level.length) {
      ids.push(...level)
      height++
    }
  }

  return { ids, height }
}

/** Todas as pastas do workspace (só id/nome/pai), indexadas por id e por pai — base da busca recursiva */
export async function getWorkspaceFolderTree(workspaceId, client = prisma) {
  const folders = await client.documentFolder.findMany({
    where: { workspaceId },
    select: { id: true, name: true, parentId: true }
  })

  const byId = new Map()
  const childrenByParent = new Map()

  for (const folder of folders) {
    byId.set(folder.id, folder)

    const siblings = childrenByParent.get(folder.parentId) ?? []

    siblings.push(folder.id)
    childrenByParent.set(folder.parentId, siblings)
  }

  return { byId, childrenByParent }
}

/** Ids da pasta e de todas as descendentes, a partir da árvore já carregada */
export function collectSubtreeIds(tree, folderId) {
  const seen = new Set([folderId])

  // Set evita laço infinito mesmo se a árvore estiver corrompida
  for (const id of seen) {
    for (const childId of tree.childrenByParent.get(id) ?? []) seen.add(childId)
  }

  return [...seen]
}

/** Caminho da raiz até a pasta (inclusive); vazio = raiz */
export function buildFolderPath(tree, folderId) {
  const path = []
  let current = folderId ? tree.byId.get(folderId) : null

  while (current && path.length <= MAX_FOLDER_DEPTH * 2) {
    path.unshift({ id: current.id, name: current.name })
    current = current.parentId ? tree.byId.get(current.parentId) : null
  }

  return path
}

// ── Nomes duplicados ────────────────────────

export class DocumentConflictError extends Error {}

/**
 * Serializa criações/renomeações/movimentações dentro da mesma pasta de destino,
 * para que a checagem de nome duplicado seja confiável sem índice único (NULL não colide no Postgres).
 */
export async function lockDocumentParent(tx, workspaceId, parentId) {
  const lockKey = `documents:${workspaceId}:${parentId ?? 'root'}`

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`
}

/** Lança DocumentConflictError se já existir item do mesmo tipo com o nome (sem diferenciar maiúsculas) */
export async function assertNameAvailable(tx, { kind, workspaceId, parentId, name, excludeId = null }) {
  const where = {
    workspaceId,
    name: { equals: name, mode: 'insensitive' },
    ...(excludeId ? { id: { not: excludeId } } : {})
  }

  const existing =
    kind === 'folder'
      ? await tx.documentFolder.findFirst({ where: { ...where, parentId: parentId ?? null }, select: { id: true } })
      : await tx.documentFile.findFirst({ where: { ...where, folderId: parentId ?? null }, select: { id: true } })

  if (existing) {
    throw new DocumentConflictError(
      kind === 'folder'
        ? `Já existe uma pasta chamada "${name}" neste local`
        : `Já existe um arquivo chamado "${name}" neste local`
    )
  }
}

// ── Upload ──────────────────────────────────

/** Remove separadores de caminho e caracteres de controle; limita a 255 caracteres preservando a extensão */
export function sanitizeFileName(rawName) {
  const baseName = String(rawName || '')
    .split(/[/\\]/)
    .pop()

  const cleaned = [...baseName]
    .filter(char => {
      const code = char.charCodeAt(0)

      return code >= 32 && code !== 127
    })
    .join('')
    .trim()

  if (cleaned === '.' || cleaned === '..') return ''
  if (cleaned.length <= 255) return cleaned

  const extension = getFileExtension(cleaned)
  const suffix = extension ? `.${extension}` : ''

  return cleaned.slice(0, 255 - suffix.length) + suffix
}

/** Valida nome, extensão, MIME informado e tamanho (antes de ler o conteúdo) */
export function validateUploadFile(file, maxBytes) {
  const name = sanitizeFileName(file?.name)

  if (!name) {
    return { ok: false, status: 400, message: 'Nome de arquivo inválido' }
  }

  const fileType = getDocumentFileType(name)

  // HTML só nasce pelo editor (template próprio, conteúdo renderizado pelo servidor), nunca por upload
  if (!isUploadableFileType(fileType)) {
    const extension = getFileExtension(name)

    return {
      ok: false,
      status: 415,
      message: extension ? `Tipo de arquivo não permitido: .${extension}` : `"${name}" não tem extensão permitida`
    }
  }

  // Alguns sistemas enviam MIME vazio ou genérico; nesses casos a assinatura binária decide (matchesFileSignature)
  const browserMime = String(file.type || '').toLowerCase()

  if (browserMime && browserMime !== 'application/octet-stream' && !fileType.acceptedMimes.includes(browserMime)) {
    return { ok: false, status: 415, message: `O tipo de "${name}" não corresponde à extensão` }
  }

  if (file.size > maxBytes) {
    return { ok: false, status: 413, message: `"${name}" excede o tamanho máximo de ${getMaxFileSizeMb()} MB` }
  }

  return { ok: true, name, fileType }
}

const ZIP_SIGNATURES = [
  [0x50, 0x4b, 0x03, 0x04],
  [0x50, 0x4b, 0x05, 0x06]
]

const FILE_SIGNATURES = {
  pdf: [[0x25, 0x50, 0x44, 0x46]],
  png: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  jpg: [[0xff, 0xd8, 0xff]],
  jpeg: [[0xff, 0xd8, 0xff]],
  docx: ZIP_SIGNATURES,
  xlsx: ZIP_SIGNATURES,
  pptx: ZIP_SIGNATURES,
  zip: ZIP_SIGNATURES
}

function startsWithBytes(buffer, bytes, offset = 0) {
  return bytes.every((byte, index) => buffer[offset + index] === byte)
}

/** Confere se o conteúdo bate com a extensão (evita, por ex., HTML renomeado para .pdf) */
export function matchesFileSignature(extension, buffer) {
  if (extension === 'webp') {
    return startsWithBytes(buffer, [0x52, 0x49, 0x46, 0x46]) && startsWithBytes(buffer, [0x57, 0x45, 0x42, 0x50], 8)
  }

  if (extension === 'txt' || extension === 'csv') {
    // Texto não pode conter byte nulo (indício de binário)
    return !buffer.subarray(0, 8192).includes(0)
  }

  const signatures = FILE_SIGNATURES[extension]

  return !!signatures && signatures.some(signature => startsWithBytes(buffer, signature))
}

// ── Serialização e download ─────────────────

export const documentCreatorInclude = {
  createdBy: { select: { id: true, name: true } }
}

export function serializeFolder(folder) {
  return {
    kind: 'folder',
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    workspaceId: folder.workspaceId,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
    createdBy: folder.createdBy ?? null
  }
}

/** Nunca expõe storageKey */
export function serializeFile(file) {
  return {
    kind: 'file',
    id: file.id,
    name: file.name,
    folderId: file.folderId,
    workspaceId: file.workspaceId,
    mimeType: file.mimeType,
    size: file.size,

    // Todo tipo de arquivo permitido tem pré-visualização: inline (PDF/imagens, rota /preview) ou estruturada
    // (/preview-data). O Site não é arquivo: abre em página própria (isSite), sem preview nem download
    isSite: isSiteMime(file.mimeType),
    previewable: !isSiteMime(file.mimeType),
    inlinePreview: isPreviewableMime(file.mimeType),

    // Documento criado no editor: pode ser reaberto para edição do conteúdo
    htmlEditable: file.mimeType === HTML_DOCUMENT_MIME,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    createdBy: file.createdBy ?? null
  }
}

function buildContentDisposition(type, fileName) {
  const asciiFallback =
    fileName
      .normalize('NFKD')
      .replace(/[^\x20-\x7e]/g, '')
      .replace(/["\\]/g, '_') || 'arquivo'

  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  )

  return `${type}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`
}

/** Conteúdo completo do arquivo em memória (pré-visualização); lança ENOENT se o blob não existir */
export async function readDocumentBuffer(file) {
  if (!file.storageKey) throw new DocumentNoContentError()

  const { stream } = await storage.get(file.storageKey)
  const chunks = []

  for await (const chunk of stream) chunks.push(chunk)

  return Buffer.concat(chunks)
}

/** Resposta em stream do conteúdo do arquivo; lança ENOENT se o blob não existir no storage */
export async function streamDocumentFile({ file, disposition, requestId }) {
  if (!file.storageKey) throw new DocumentNoContentError()

  const { stream, size } = await storage.get(file.storageKey)

  return new Response(Readable.toWeb(stream), {
    status: 200,
    headers: {
      'Content-Type': file.mimeType,
      'Content-Length': String(size),
      'Content-Disposition': buildContentDisposition(disposition, file.name),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      'x-request-id': requestId,

      // Substitui a CSP global (next.config.mjs). Defesa extra: se um HTML for aberto direto pelo navegador, roda
      // isolado e sem scripts
      'Content-Security-Policy':
        file.mimeType === HTML_DOCUMENT_MIME
          ? `sandbox; frame-ancestors 'self'; ${HTML_DOCUMENT_CSP}`
          : "frame-ancestors 'self'"
    }
  })
}

const FILE_ACCESS_ACTIONS = { view: 'DOCUMENT_FILE_VIEW', download: 'DOCUMENT_FILE_DOWNLOAD' }

/**
 * Registra no AuditLog quem abriu (`view`) ou baixou (`download`) um arquivo.
 * O mesmo usuário no mesmo arquivo conta uma vez a cada 15 min (reaberturas e requisições repetidas do
 * visualizador não poluem o log). Falha no log nunca derruba a resposta.
 */
export async function recordDocumentFileAccess({ session, file, kind, requestId }) {
  try {
    await createDedupedAuditLog({
      userId: session.user.id,
      tenantId: file.workspaceId,
      action: FILE_ACCESS_ACTIONS[kind],
      resource: 'document_file',
      resourceId: file.id,
      metadata: { requestId, name: file.name, folderId: file.folderId },
      requestId
    })
  } catch (error) {
    logger.error('document-file-access-audit-error', { requestId, fileId: file.id, kind, error: error.message })
  }
}
