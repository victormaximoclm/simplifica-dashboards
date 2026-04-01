// Validates that required environment variables are set.
// Imported by prisma.js to fail fast on misconfiguration.
// Skipped during next build — only enforced at runtime.

const isBuild = process.env.NEXT_PHASE === 'phase-production-build' || process.env.npm_lifecycle_event === 'build'

if (!isBuild) {
  const required = ['DATABASE_URL', 'NEXTAUTH_SECRET', 'API_URL']
  const missing = required.filter(key => !process.env[key])

  if (missing.length > 0) {
    throw new Error(`❌ Variáveis de ambiente obrigatórias não definidas: ${missing.join(', ')}`)
  }
}
