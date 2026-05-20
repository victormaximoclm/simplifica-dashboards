import { prisma } from '@/libs/prisma'

export async function getUserIntegration(userId, provider) {
  return prisma.userIntegration.findFirst({
    where: {
      userId,
      provider
    }
  })
}

export async function upsertUserIntegration(userId, provider, data) {
  return prisma.userIntegration.upsert({
    where: {
      userId_provider: {
        userId,
        provider
      }
    },

    update: {
      token: data.token,
      accountEmail: data.accountEmail,
      accountId: data.accountId,
      enabled: data.enabled,
      configJson: data.configJson
    },

    create: {
      userId,
      provider,
      token: data.token,
      accountEmail: data.accountEmail,
      accountId: data.accountId,
      enabled: data.enabled,
      configJson: data.configJson
    }
  })
}

export async function deleteUserIntegration(userId, provider) {
  return prisma.userIntegration.delete({
    where: {
      userId_provider: { userId, provider }
    }
  })
}
