// Validates that required environment variables are set.
// Imported by auth.js and prisma.js to fail fast on misconfiguration.

const required = ['DATABASE_URL', 'NEXTAUTH_SECRET', 'API_URL']

const missing = required.filter(key => !process.env[key])

if (missing.length > 0) {
  throw new Error(`❌ Variáveis de ambiente obrigatórias não definidas: ${missing.join(', ')}`)
}
