'use client'

import { useEffect } from 'react'

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    fetch('/api/observability/error-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'frontend-global-error',
        level: 'error',
        message: error?.message || 'global-error',
        stack: error?.stack || null,
        path: typeof window !== 'undefined' ? window.location.pathname : null
      }),
      keepalive: true
    }).catch(() => {})
  }, [error])

  return (
    <html>
      <body>
        <h2>Ocorreu um erro inesperado.</h2>
        <button onClick={() => reset()}>Tentar novamente</button>
      </body>
    </html>
  )
}
