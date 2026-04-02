'use client'

import { useEffect, useRef } from 'react'

import { signOut, useSession } from 'next-auth/react'
import { useParams } from 'next/navigation'

const POLL_MS = 25000

const MESSAGES = {
  removed: 'Sua conta foi removida. Faça login novamente ou contate o administrador.',
  inactive: 'Sua conta foi inativada. Faça login novamente ou contate o administrador.'
}

/**
 * Enquanto o usuário está na área privada, verifica periodicamente se a conta ainda é válida no banco.
 * Se admin inativar/remover, faz signOut com redirect único para login (sem cadeia de redirects).
 */
export default function SessionValidityMonitor() {
  const { status } = useSession()
  const params = useParams()
  const lang = params?.lang || 'br'
  const ticking = useRef(false)

  useEffect(() => {
    if (status !== 'authenticated') return

    const run = async () => {
      if (ticking.current) return
      ticking.current = true
      try {
        const res = await fetch('/api/auth/session-status', {
          cache: 'no-store',
          credentials: 'include'
        })

        if (res.status === 401) return

        const data = await res.json().catch(() => ({}))

        if (data.ok === false && (data.reason === 'inactive' || data.reason === 'removed')) {
          const msg = MESSAGES[data.reason]
          await signOut({
            callbackUrl: `/${lang}/login?error=${encodeURIComponent(msg)}`,
            redirect: true
          })
        }
      } finally {
        ticking.current = false
      }
    }

    run()
    const interval = setInterval(run, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') run()
    }

    window.addEventListener('focus', run)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', run)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [status, lang])

  return null
}
