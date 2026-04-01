'use client'

import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

const GlobalError = ({ error, reset }) => {
  return (
    <html lang='br'>
      <body className='flex is-full min-bs-full flex-auto flex-col'>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '2rem',
            textAlign: 'center',
            fontFamily: 'system-ui, -apple-system, sans-serif'
          }}
        >
          <Typography variant='h3' sx={{ mb: 2 }}>
            Algo deu errado
          </Typography>
          <Typography variant='body1' sx={{ mb: 4, color: 'text.secondary', maxWidth: 480 }}>
            Ocorreu um erro inesperado. Tente recarregar a página.
          </Typography>
          <Button variant='contained' onClick={() => reset()}>
            Tentar novamente
          </Button>
        </div>
      </body>
    </html>
  )
}

export default GlobalError
