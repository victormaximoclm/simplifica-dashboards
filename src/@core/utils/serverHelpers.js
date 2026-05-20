// Next Imports
import { cookies } from 'next/headers'

// Third-party Imports
import 'server-only'

// Config Imports
import themeConfig from '@configs/themeConfig'

// Util Imports
import { getEffectiveMode } from '@core/utils/themeMode'

export const getSettingsFromCookie = async () => {
  const cookieStore = await cookies()
  const cookieName = themeConfig.settingsCookieName

  return JSON.parse(cookieStore.get(cookieName)?.value || '{}')
}

export const getMode = async () => {
  if (themeConfig.forceDarkMode) return 'dark'

  const settingsCookie = await getSettingsFromCookie()
  const _mode = settingsCookie.mode || themeConfig.mode

  return _mode
}

export const getSystemMode = async () => {
  if (themeConfig.forceDarkMode) return 'dark'

  const cookieStore = await cookies()
  const mode = await getMode()
  const colorPrefCookie = cookieStore.get('colorPref')?.value || 'light'

  return getEffectiveMode(mode === 'system' ? colorPrefCookie : mode)
}

export const getServerMode = async () => {
  if (themeConfig.forceDarkMode) return 'dark'

  const mode = await getMode()
  const systemMode = await getSystemMode()

  return mode === 'system' ? systemMode : getEffectiveMode(mode)
}

export const getSkin = async () => {
  const settingsCookie = await getSettingsFromCookie()

  return settingsCookie.skin || 'default'
}
