'use client'

import { cloneElement, useState } from 'react'

const OpenDialogOnElementClick = ({ element: Element, elementProps, dialog: Dialog, dialogProps }) => {
  const [open, setOpen] = useState(false)

  const { children, ...rest } = elementProps

  return (
    <>
      <Element {...rest} onClick={() => setOpen(true)}>
        {children}
      </Element>
      <Dialog open={open} setOpen={setOpen} {...dialogProps} />
    </>
  )
}

export default OpenDialogOnElementClick
