// Valida variáveis obrigatórias em runtime (não durante `next build`).
// Importado por prisma.js para falhar cedo se faltar configuração.

const isBuild =
  process.env.NEXT_PHASE === 'phase-production-build' || process.env.npm_lifecycle_event === 'build'

if (!isBuild) {
  const required = ['DATABASE_URL', 'NEXTAUTH_SECRET', 'API_URL']

  if (process.env.NODE_ENV === 'production') {
    required.push('NEXTAUTH_URL')
  }

  const missing = required.filter(key => !process.env[key])

  if (missing.length > 0) {
    throw new Error(`❌ Variáveis de ambiente obrigatórias não definidas: ${missing.join(', ')}`)
  }
}
