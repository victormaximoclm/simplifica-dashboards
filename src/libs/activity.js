import { prisma } from '@/libs/prisma'

const DEFAULT_MIN_INTERVAL_MINUTES = 2

export async function touchUserActivity(userId, minIntervalMinutes = DEFAULT_MIN_INTERVAL_MINUTES) {
  if (!userId) return

  const now = new Date()
  const cutoff = new Date(now.getTime() - minIntervalMinutes * 60 * 1000)

  await prisma.user.updateMany({
    where: {
      id: userId,
      OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: cutoff } }]
    },
    data: { lastActivityAt: now }
  })
}
