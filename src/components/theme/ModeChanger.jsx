// React Imports
import { useEffect } from 'react'

// MUI Imports
import { useColorScheme } from '@mui/material/styles'

// Third-party Imports
import { useMedia } from 'react-use'

// Config Imports
import themeConfig from '@configs/themeConfig'

// Hook Imports
import { useSettings } from '@core/hooks/useSettings'

const ModeChanger = ({ systemMode }) => {
  const { setMode } = useColorScheme()
  const { settings, updateSettings } = useSettings()
  const isDark = useMedia('(prefers-color-scheme: dark)', systemMode === 'dark')

  useEffect(() => {
    if (themeConfig.forceDarkMode) {
      setMode('dark')
      if (settings.mode !== 'dark') {
        updateSettings({ mode: 'dark' })
      }
      return
    }

    if (settings.mode) {
      if (settings.mode === 'system') {
        setMode(isDark ? 'dark' : 'light')
      } else {
        setMode(settings.mode)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.mode, isDark])

  return null
}

export default ModeChanger
