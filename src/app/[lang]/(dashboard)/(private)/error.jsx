'use client'

import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

const Error = ({ error, reset }) => {
  return (
    <div className='flex flex-col items-center justify-center min-bs-[50vh] gap-4 p-6 text-center'>
      <i className='tabler-alert-triangle text-5xl text-error' />
      <Typography variant='h5'>Algo deu errado</Typography>
      <Typography variant='body1' color='text.secondary' sx={{ maxWidth: 480 }}>
        Ocorreu um erro ao carregar esta página. Tente novamente ou volte à página anterior.
      </Typography>
      <div className='flex gap-3'>
        <Button variant='contained' onClick={() => reset()}>
          Tentar novamente
        </Button>
        <Button variant='outlined' onClick={() => window.history.back()}>
          Voltar
        </Button>
      </div>
    </div>
  )
}

export default Error
