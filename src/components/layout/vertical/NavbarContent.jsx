// Third-party Imports
import classnames from 'classnames'

// Component Imports
import NavToggle from './NavToggle'
import NavSearch from '@components/layout/shared/search'
import LanguageDropdown from '@components/layout/shared/LanguageDropdown'
import ModeDropdown from '@components/layout/shared/ModeDropdown'
import NotificationsDropdown from '@components/layout/shared/NotificationsDropdown'
import UserDropdown from '@components/layout/shared/UserDropdown'
import WorkspaceSwitcher from '@components/layout/shared/WorkspaceSwitcher'

// Util Imports
import { verticalLayoutClasses } from '@layouts/utils/layoutClasses'

const NavbarContent = () => {
  return (
    <div className={classnames(verticalLayoutClasses.navbarContent, 'flex items-center justify-between gap-2 is-full')}>
      <div className='flex items-center gap-2 min-w-0 flex-1'>
        <NavToggle />
        <div className='min-w-0 max-w-[140px] sm:max-w-none'>
          <WorkspaceSwitcher />
        </div>
      </div>
      <div className='flex items-center gap-1 shrink-0'>
        <div className='hidden sm:flex items-center'>
          <LanguageDropdown />
          <ModeDropdown />
        </div>
        <NotificationsDropdown />
        <UserDropdown />
      </div>
    </div>
  )
}

export default NavbarContent
