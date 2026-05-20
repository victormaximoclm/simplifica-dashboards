import { prisma } from '@/libs/prisma'

export async function getWorkspaceIntegration(workspaceId, provider) {
  return prisma.workspaceIntegration.findFirst({
    where: {
      workspaceId,
      provider
    }
  })
}

export async function upsertWorkspaceIntegration(workspaceId, provider, data) {
  return prisma.workspaceIntegration.upsert({
    where: {
      workspaceId_provider: {
        workspaceId,
        provider
      }
    },

    update: {
      enabled: data.enabled,
      configJson: data.configJson
    },

    create: {
      workspaceId,
      provider,
      enabled: data.enabled,
      configJson: data.configJson
    }
  })
}
