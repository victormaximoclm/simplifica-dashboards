import { cleanupExpiredInvites } from '@/libs/inviteCleanup'
import { logger } from '@/libs/logger'

/**
 * Rotinas agendadas do servidor, iniciadas uma vez pelo src/instrumentation.js.
 * INVITE_CLEANUP_INTERVAL_MINUTES: intervalo da limpeza de convites expirados (padrão 60; 0 desliga).
 */

const FIRST_RUN_DELAY_MS = 60_000

function every(name, minutes, job) {
  if (!minutes) {
    logger.info('scheduled-job-disabled', { job: name })

    return
  }

  const run = async () => {
    try {
      await job()
    } catch (error) {
      // Uma execução com erro não derruba o app nem as próximas
      logger.error('scheduled-job-failed', { job: name, error: error.message })
    }
  }

  // Primeira execução um pouco depois de subir: o banco e as migrations já estão prontos
  setTimeout(run, FIRST_RUN_DELAY_MS).unref()
  setInterval(run, minutes * 60_000).unref()

  logger.info('scheduled-job-started', { job: name, everyMinutes: minutes })
}

export function startScheduledJobs() {
  // Em dev o módulo pode ser recarregado: não agenda a mesma rotina duas vezes
  if (globalThis.__scheduledJobsStarted) return
  globalThis.__scheduledJobsStarted = true

  const raw = process.env.INVITE_CLEANUP_INTERVAL_MINUTES
  const minutes = raw === undefined || raw === '' ? 60 : Math.max(0, Number(raw) || 0)

  every('invite-cleanup', minutes, cleanupExpiredInvites)
}
