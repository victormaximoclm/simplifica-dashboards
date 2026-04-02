'use client'

import { useState } from 'react'

import { useRouter, useSearchParams, useParams } from 'next/navigation'

import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'

import Alert from '@mui/material/Alert'

import CustomTextField from '@core/components/mui/TextField'
import { getLocalizedUrl } from '@/utils/i18n'

const ResetPassword = ({ mode }) => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { lang: locale } = useParams()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const token = searchParams.get('token')

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!password || !confirmPassword) {
      setError('Preencha todos os campos.')

      return
    }

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.')

      return
    }

    setLoading(true)

    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password })
    })

    const data = await res.json()

    setLoading(false)

    if (res.ok) {
      setSuccess('Senha redefinida com sucesso!')
      setTimeout(() => {
        router.replace(getLocalizedUrl('/login', locale))
      }, 2000)
    } else {
      setError(data.message || 'Erro ao redefinir senha.')
    }
  }

  return (
    <div className='flex flex-col gap-6 items-center justify-center min-h-[60vh]'>
      <Typography variant='h4'>Redefinir senha</Typography>
      {error && <Alert severity='error'>{error}</Alert>}
      {success && <Alert severity='success'>{success}</Alert>}
      <form className='flex flex-col gap-4 min-w-[320px]' onSubmit={handleSubmit}>
        <CustomTextField
          label='Nova senha'
          type='password'
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <CustomTextField
          label='Confirmar nova senha'
          type='password'
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
        />
        <Button variant='contained' type='submit' disabled={loading}>
          Redefinir senha
        </Button>
      </form>
    </div>
  )
}

export default ResetPassword
