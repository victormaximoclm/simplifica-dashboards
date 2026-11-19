'use client'

import { useState } from 'react'

import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'

import { btnPrimary } from '@/views/forms/formStyles'

/**
 * Botão principal "Novo" da tela de Documentos: reúne os tipos de item que se criam do zero
 * (pasta, documento, site). Enviar arquivo e Templates ficam como ações de apoio ao lado.
 *
 * options: [{ text, icon, onClick }]
 */
const NewItemMenu = ({ options }) => {
  const [anchorEl, setAnchorEl] = useState(null)

  const close = () => setAnchorEl(null)

  return (
    <>
      <button
        type='button'
        aria-haspopup='menu'
        aria-expanded={!!anchorEl}
        onClick={event => setAnchorEl(event.currentTarget)}
        className={btnPrimary}
      >
        <i className='tabler-plus text-base' />
        Novo
        <i className='tabler-chevron-down text-base' />
      </button>
      <Menu
        anchorEl={anchorEl}
        open={!!anchorEl}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        {options.map(option => (
          <MenuItem
            key={option.text}
            className='flex items-center gap-2'
            onClick={() => {
              close()
              option.onClick()
            }}
          >
            <i className={`${option.icon} text-xl`} />
            {option.text}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}

export default NewItemMenu
