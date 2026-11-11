'use client'

import { useState } from 'react'

import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'

/**
 * Menu de ações de um item (pasta/arquivo). Usa o Menu do MUI, que renderiza em portal:
 * diferente do OptionMenu (disablePortal), não é cortado pelo overflow do card da lista.
 *
 * options: [{ text, icon, onClick, className }] ou { divider: true }
 */
const DocumentItemMenu = ({ options, label }) => {
  const [anchorEl, setAnchorEl] = useState(null)

  const close = () => setAnchorEl(null)

  return (
    <>
      <IconButton
        size='small'
        aria-label={label}
        aria-haspopup='menu'
        onClick={event => {
          event.stopPropagation()
          setAnchorEl(event.currentTarget)
        }}
      >
        <i className='tabler-dots-vertical' />
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={!!anchorEl}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {options.map((option, index) =>
          option.divider ? (
            <Divider key={`divider-${index}`} />
          ) : (
            <MenuItem
              key={option.text}
              className={`flex items-center gap-2 ${option.className ?? ''}`}
              onClick={() => {
                close()
                option.onClick()
              }}
            >
              <i className={`${option.icon} text-xl`} />
              {option.text}
            </MenuItem>
          )
        )}
      </Menu>
    </>
  )
}

export default DocumentItemMenu
