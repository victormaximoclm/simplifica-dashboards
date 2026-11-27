// Chamado pelo Next uma vez quando o servidor sobe. As rotinas agendadas só rodam no runtime Node (não no edge).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { startScheduledJobs } = await import('@/libs/scheduledJobs')

  startScheduledJobs()
}
