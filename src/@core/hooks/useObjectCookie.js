// React Imports
import { useMemo } from 'react'

// Third-party Imports
import { useCookie } from 'react-use'

export const useObjectCookie = (key, fallback) => {
  // Hooks
  const [valStr, updateCookie] = useCookie(key)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo(() => {
    if (!valStr) return fallback

    try {
      return JSON.parse(valStr)
    } catch {
      // Cookie corrompido: usa o padrão em vez de derrubar a árvore
      return fallback
    }
  }, [valStr])

  const updateValue = newVal => {
    updateCookie(JSON.stringify(newVal))
  }

  return [value, updateValue]
}
