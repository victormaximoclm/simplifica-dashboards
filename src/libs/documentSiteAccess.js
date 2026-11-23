import { prisma } from '@/libs/prisma'
import { isSiteMime } from '@/libs/documentFileTypes'
import { SITE_IMAGE_MIMES, SiteContentError, collectSiteFileIds } from '@/libs/documentSite'
import { documentCreatorInclude, getAuthorizedDocumentItem, serializeFile } from '@/libs/documentAccess'

/** Corpo máximo aceito nas rotas de página (o conteúdo já limpo tem outro teto, em documentSite.js) */
export const SITE_MAX_REQUEST_BYTES = 1024 * 1024

/**
 * Carrega o Site (um DocumentFile do tipo site) validando perfil + workspace para a ação, pelas mesmas regras
 * dos demais arquivos do módulo (documentPermissions + escopo do workspace). Um arquivo que não é Site responde 404.
 * Retorna { ok, status, message, item, workspace }.
 */
export async function getAuthorizedSite({ id, session, action }) {
  const access = await getAuthorizedDocumentItem({ kind: 'file', id, session, action })

  if (!access.ok) return access

  if (!isSiteMime(access.item.mimeType)) {
    return { ok: false, status: 404, message: 'Site não encontrado' }
  }

  return access
}

/** Página do Site (a consulta já exige que ela pertença ao Site: id de outro Site responde como inexistente) */
export const findSitePage = (siteId, pageId) => prisma.documentSitePage.findFirst({ where: { id: pageId, siteId } })

/** Criar, mover e excluir páginas rodam em série por Site: limite de páginas, profundidade e posições dependem do conjunto */
export async function lockSite(tx, siteId) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`document-site:${siteId}`}))`
}

/** Lê o corpo JSON com teto de tamanho: { body } ou { tooLarge } (mesmo critério do editor de documentos HTML) */
export async function readSiteJsonBody(req) {
  if (Number(req.headers.get('content-length') || 0) > SITE_MAX_REQUEST_BYTES) return { tooLarge: true }

  const text = await req.text().catch(() => '')

  if (text.length > SITE_MAX_REQUEST_BYTES) return { tooLarge: true }

  try {
    return { body: JSON.parse(text) }
  } catch {
    return { body: null }
  }
}

/**
 * Referências de arquivo de uma página, resolvidas dentro do workspace do Site. É o ponto único de decisão de quem
 * pode ver o quê: se o módulo ganhar permissão por arquivo, ela entra aqui.
 *
 * Cada id pedido volta no mapa. Disponível: metadados no formato da listagem (nunca storageKey). Excluído, de outro
 * workspace, sem blob, Site ou sem acesso do leitor (`viewer`, só na leitura): só { id, available: false }, sem
 * nenhum dado (todos esses casos são indistinguíveis).
 */
export async function resolveSiteFileRefs(fileIds, workspaceId, viewer = null) {
  const files = {}

  for (const id of fileIds) files[id] = { id, available: false }

  if (!fileIds.length) return files

  const rows = await prisma.documentFile.findMany({
    where: { id: { in: fileIds }, workspaceId, storageKey: { not: null } },
    include: documentCreatorInclude
  })

  for (const row of rows) {
    // Na leitura, o acesso por cargo da pasta/arquivo vale também para referências dentro das páginas
    if (viewer && !viewer.canSeeFile(row)) continue

    files[row.id] = {
      ...serializeFile(row),
      available: true,
      canDownload: viewer ? viewer.canDownloadFile(row) : true
    }
  }

  return files
}

/**
 * Ao gravar: todo arquivo referenciado precisa existir no workspace do Site, ter conteúdo (não pode ser outro Site)
 * e, no bloco de imagem, ser PNG, JPG ou WebP. Lança SiteContentError.
 */
export async function assertSiteFileRefs(blocks, workspaceId) {
  const files = await resolveSiteFileRefs(collectSiteFileIds(blocks), workspaceId)

  for (const block of blocks) {
    if (block.type !== 'file' && block.type !== 'image') continue

    const file = files[block.fileId]

    if (!file?.available) throw new SiteContentError('Um arquivo usado na página não foi encontrado neste workspace')

    if (block.type === 'image' && !SITE_IMAGE_MIMES.includes(file.mimeType))
      throw new SiteContentError('O bloco de imagem aceita apenas arquivos PNG, JPG ou WebP')
  }
}
