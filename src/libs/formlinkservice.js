import { prisma } from '@/libs/prisma'

/** Link público ainda aceita visualização e envio */
export function isPublicLinkActive(link) {
  if (!link) return false
  if (link.used) return false
  if (new Date() >= new Date(link.expiresAt)) return false
  return true
}

export function getPublicLinkInactiveReason(link) {
  if (!link) return 'invalid'
  if (link.used) return 'used'
  if (new Date() >= new Date(link.expiresAt)) return 'expired'
  return null
}

// Gera link público com expiração em horas (padrão 24h)
export async function generatePublicLink(formId, expiresInHours = 24) {
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000)

  return prisma.formPublicLink.create({
    data: { formId, expiresAt }
  })
}

// Valida token e retorna o form — lança erro se inválido/expirado/usado
export async function validateToken(token) {
  const link = await prisma.formPublicLink.findUnique({
    where: { token },
    include: { form: true }
  })

  if (!link) throw new Error('Link inválido')
  if (!isPublicLinkActive(link)) {
    if (link.used) throw new Error('Link já utilizado')
    throw new Error('Link expirado')
  }

  return link
}

/**
 * Reserva o link para um único envio (atômico).
 * Marca used=true e expiresAt=agora para bloquear reenvio imediato.
 * @returns {Promise<boolean>} true se o link foi consumido nesta requisição
 */
export async function claimPublicLinkForSubmit({ token, formId }) {
  const now = new Date()

  const result = await prisma.formPublicLink.updateMany({
    where: {
      token,
      formId,
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

// Lista links de um form
export async function listLinks(formId) {
  return prisma.formPublicLink.findMany({
    where: { formId },
    orderBy: { createdAt: 'desc' }
  })
}
