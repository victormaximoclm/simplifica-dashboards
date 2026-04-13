'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

const CLIENT_THROTTLE_MS = 60 * 1000

const sendActivityPing = () => {
  fetch('/api/auth/activity', {
    method: 'POST',
    keepalive: true,
    credentials: 'include'
  }).catch(() => {})
}

const ActivityTracker = () => {
  const pathname = usePathname()
  const lastSentRef = useRef(0)

  const markActivity = force => {
    const now = Date.now()

    if (!force && now - lastSentRef.current < CLIENT_THROTTLE_MS) return
    lastSentRef.current = now
    sendActivityPing()
  }

  useEffect(() => {
    // Page/view navigation counts as user activity.
    markActivity(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  useEffect(() => {
    const onPointerDown = () => markActivity(false)
    const onKeyDown = () => markActivity(false)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') markActivity(false)
    }

    window.addEventListener('pointerdown', onPointerDown, { passive: true })
    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  return null
}

export default ActivityTracker
