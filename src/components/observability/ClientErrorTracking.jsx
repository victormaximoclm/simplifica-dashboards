'use client'

import { useEffect } from 'react'

function trackClientError(payload) {
  fetch('/api/observability/error-events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true
  }).catch(() => {
    // intentionally swallow to avoid recursive error loops
  })
}

export default function ClientErrorTracking() {
  useEffect(() => {
    const onError = event => {
      if (event?.error) {
        trackClientError({
          source: 'frontend-runtime',
          level: 'error',
          message: event.error.message || 'window-error',
          stack: event.error.stack || null,
          path: window.location.pathname,
          metadata: {
            filename: event.filename || null,
            lineno: event.lineno || null,
            colno: event.colno || null
          }
        })
      }
    }
    const onRejection = event => {
      if (event?.reason) {
        trackClientError({
          source: 'frontend-rejection',
          level: 'error',
          message: event.reason?.message || String(event.reason),
          stack: event.reason?.stack || null,
          path: window.location.pathname
        })
      }
    }

    const nativeFetch = window.fetch.bind(window)
    window.fetch = async (...args) => {
      const response = await nativeFetch(...args)

      if (!response.ok) {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || 'unknown'
        trackClientError({
          source: 'frontend-api',
          level: response.status >= 500 ? 'error' : 'warn',
          message: 'frontend-api-failure',
          path: url,
          metadata: {
            status: response.status,
            requestId: response.headers.get('x-request-id')
          }
        })
      }

      return response
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)

    return () => {
      window.fetch = nativeFetch
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  return null
}
