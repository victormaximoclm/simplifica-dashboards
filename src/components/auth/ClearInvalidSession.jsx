'use client'

import { useEffect, useRef } from 'react'

import { signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'

const MESSAGES = {
  removed: 'Sua conta foi removida. Faça login novamente ou contate o administrador.',
  inactive: 'Sua conta foi inativada. Faça login novamente ou contate o administrador.'
}

/**
 * Remove o cookie de sessão quando ainda há JWT mas o usuário foi removido/inativado (evita loop login ↔ dashboard no GuestOnlyRoute).
 * Redireciona uma vez para /[lang]/login com aviso.
 */
export default function ClearInvalidSession({ lang, reason }) {
  const router = useRouter()
  const done = useRef(false)

  useEffect(() => {
    if (done.current) return
    done.current = true

    const msg = MESSAGES[reason] || MESSAGES.inactive

    signOut({ redirect: false }).then(() => {
      router.replace(`/${lang}/login?error=${encodeURIComponent(msg)}`)
    })
  }, [lang, reason, router])

  return null
}
