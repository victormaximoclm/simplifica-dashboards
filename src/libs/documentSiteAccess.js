import { isSiteMime } from '@/libs/documentFileTypes'
import { getAuthorizedDocumentItem } from '@/libs/documentAccess'

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
