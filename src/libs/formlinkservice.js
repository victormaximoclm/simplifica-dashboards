import { prisma } from '@/libs/prisma'

/** Motivo pelo qual o link não aceita visualização/envio (null = ativo) */
export function getPublicLinkInactiveReason(link) {
  if (!link) return 'invalid'
  if (link.revokedAt) return 'revoked'
  if (link.permanent) return null
  if (link.used) return 'used'
  if (!link.expiresAt || new Date() >= new Date(link.expiresAt)) return 'expired'
  return null
}

/** Link público ainda aceita visualização e envio */
export function isPublicLinkActive(link) {
  return getPublicLinkInactiveReason(link) === null
}

// Gera link público temporário (expira em horas, uso único) ou permanente (reutilizável, sem expiração)
export async function generatePublicLink(formId, { permanent = false, expiresInHours = 24 } = {}) {
  const expiresAt = permanent ? null : new Date(Date.now() + expiresInHours * 60 * 60 * 1000)

  return prisma.formPublicLink.create({
    data: { formId, expiresAt, permanent }
  })
}

// Valida token e retorna o form — lança erro se inválido/expirado/usado
export async function validateToken(token) {
  const link = await prisma.formPublicLink.findUnique({
    where: { token },
    include: { form: true }
  })

  if (!link) throw new Error('Link inválido')
  const reason = getPublicLinkInactiveReason(link)

  if (reason) {
    if (reason === 'revoked') throw new Error('Link desativado')
    if (reason === 'used') throw new Error('Link já utilizado')
    throw new Error('Link expirado')
  }

  return link
}

/**
 * Reserva o link para um envio (atômico).
 * Temporário: marca used=true e expiresAt=agora para bloquear reenvio imediato.
 * Permanente: apenas valida que está ativo (não é consumido).
 * @returns {Promise<boolean>} true se o link foi consumido nesta requisição
 */
export async function claimPublicLinkForSubmit({ token, formId }) {
  const now = new Date()

  const permanent = await prisma.formPublicLink.count({
    where: { token, formId, permanent: true, revokedAt: null }
  })

  if (permanent > 0) return true

  const result = await prisma.formPublicLink.updateMany({
    where: {
      token,
      formId,
      permanent: false,
      revokedAt: null,
      used: false,
      expiresAt: { gt: now }
    },
    data: {
      used: true,
      expiresAt: now
    }
  })

  return result.count > 0
}

// Marca link como usado após submit (legado — preferir claimPublicLinkForSubmit)
export async function consumeToken(token) {
  const now = new Date()
  return prisma.formPublicLink.update({
    where: { token },
    data: { used: true, expiresAt: now }
  })
}

// Desativa um link (temporário ou permanente)
export async function revokePublicLink(linkId) {
  return prisma.formPublicLink.update({
    where: { id: linkId },
    data: { revokedAt: new Date() }
  })
}

// Lista links de um form
export async function listLinks(formId) {
  return prisma.formPublicLink.findMany({
    where: { formId },
    orderBy: { createdAt: 'desc' }
  })
}
