import themeConfig from '@configs/themeConfig'

/** Modo efetivo da UI (respeita forceDarkMode) */
export const getEffectiveMode = mode => {
  if (themeConfig.forceDarkMode) return 'dark'
  return mode || themeConfig.mode || 'dark'
}
