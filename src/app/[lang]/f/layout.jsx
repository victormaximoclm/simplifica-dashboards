import Providers from '@components/Providers'

import { i18n } from '@configs/i18n'
import { getMode, getSystemMode } from '@core/utils/serverHelpers'

const PublicFormLayout = async props => {
  const params = await props.params
  const { children } = props

  const lang = i18n.locales.includes(params.lang) ? params.lang : i18n.defaultLocale
  const direction = i18n.langDirection[lang]
  const systemMode = await getSystemMode()

  return (
    <Providers direction={direction}>
      <div className='min-h-screen bg-backgroundDefault'>{children}</div>
    </Providers>
  )
}

export default PublicFormLayout
