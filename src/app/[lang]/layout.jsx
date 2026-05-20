// Next Imports
import { headers } from 'next/headers'

// MUI Imports
import InitColorSchemeScript from '@mui/material/InitColorSchemeScript'

// Third-party Imports
import 'react-perfect-scrollbar/dist/css/styles.css'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'

// Component Imports
import ClientErrorTracking from '@/components/observability/ClientErrorTracking'

// HOC Imports
import TranslationWrapper from '@/hocs/TranslationWrapper'

// Config Imports
import { i18n } from '@configs/i18n'

// Util Imports
import { getSystemMode } from '@core/utils/serverHelpers'

// Style Imports
import '@/app/globals.css'

// Generated Icon CSS Imports
import '@assets/iconify-icons/generated-icons.css'

export const metadata = {
  title: 'Simpla Insights',
  description:
    'Simpla Insights - Dashboards interativos e fáceis de usar. Transforme seus dados em insights visuais poderosos.'
}

const RootLayout = async props => {
  const params = await props.params
  const { children } = props

  // Type guard to ensure lang is a valid Locale
  const lang = i18n.locales.includes(params.lang) ? params.lang : i18n.defaultLocale

  // Vars
  const headersList = await headers()
  const systemMode = await getSystemMode()
  const direction = i18n.langDirection[lang]

  return (
    <TranslationWrapper headersList={headersList} lang={lang}>
      <html id='__next' lang={lang} dir={direction} suppressHydrationWarning>
        <body className='flex is-full min-bs-full flex-auto flex-col'>
          <InitColorSchemeScript attribute='data' defaultMode={systemMode} />
          <ClientErrorTracking />
          {children}
          <ToastContainer position='top-right' />
        </body>
      </html>
    </TranslationWrapper>
  )
}

export default RootLayout
