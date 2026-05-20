import * as clickup from './clickup'
import * as webhook from './webhook'

const providers = {
  clickup,
  webhook,
  // aliases legados → webhook n8n
  'google-sheets': webhook,
  csv: webhook
}

export function resolveDataSource(provider) {
  if (!providers[provider]) {
    throw new Error(`Provider '${provider}' não suportado`)
  }

  return providers[provider]
}
