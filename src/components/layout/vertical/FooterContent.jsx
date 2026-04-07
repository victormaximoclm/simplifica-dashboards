'use client'

// Next Imports
import Link from 'next/link'

// Third-party Imports
import classnames from 'classnames'

// MUI Imports
import { useColorScheme } from '@mui/material/styles'

// Hook Imports
import useVerticalNav from '@menu/hooks/useVerticalNav'

// Util Imports
import { verticalLayoutClasses } from '@layouts/utils/layoutClasses'

const FooterContent = () => {
  // Hooks
  const { isBreakpointReached } = useVerticalNav()
  const { mode } = useColorScheme()

  const textClass = mode === 'light' ? 'text-[#808390]' : 'text-textSecondary'

  return (
    <div
      className={classnames(verticalLayoutClasses.footerContent, 'flex items-center justify-between flex-wrap gap-4')}
    >
      <p>
        <span className={textClass}>{`© ${new Date().getFullYear()}, Todos direitos reservados `}</span>
        <span className={textClass}>{` a `}</span>
        <Link href='https://simplificagest.com' target='_blank' className='text-primary'>
          Simplifica Soluções em Gestão e Consultoria
        </Link>
      </p>
      {/* {!isBreakpointReached && (
        <div className='flex items-center gap-4'>
          <Link href='' target='_blank' className='text-primary'>
            Licença
          </Link>
          <Link href='' target='_blank' className='text-primary'>
            Documentação
          </Link>
          <Link href='' target='_blank' className='text-primary'>
            Support
          </Link>
        </div>
      )} */}
    </div>
  )
}

export default FooterContent
