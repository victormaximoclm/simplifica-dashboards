'use client'

// React Imports
import { useState, useEffect } from 'react'

// Next Imports
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'

// MUI Imports
import useMediaQuery from '@mui/material/useMediaQuery'
import { styled, useTheme } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'

// Third-party Imports
import classnames from 'classnames'

// Component Imports
import Logo from '@components/layout/shared/Logo'
import CustomTextField from '@core/components/mui/TextField'

// Hook Imports
import { useImageVariant } from '@core/hooks/useImageVariant'
import { useSettings } from '@core/hooks/useSettings'

// Util Imports
import { getLocalizedUrl } from '@/utils/i18n'

// Styled Custom Components
const Illustration = styled('img')(({ theme }) => ({
  zIndex: 2,
  blockSize: 'auto',
  maxBlockSize: 680,
  maxInlineSize: '100%',
  margin: theme.spacing(12),
  [theme.breakpoints.down(1536)]: {
    maxBlockSize: 550
  },
  [theme.breakpoints.down('lg')]: {
    maxBlockSize: 450
  }
}))

const MaskImg = styled('img')({
  blockSize: 'auto',
  maxBlockSize: 355,
  inlineSize: '100%',
  position: 'absolute',
  insetBlockEnd: 0,
  zIndex: -1
})

const AcceptInvite = ({ mode }) => {
  // States
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [inviteData, setInviteData] = useState(null)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isPasswordShown, setIsPasswordShown] = useState(false)
  const [isConfirmPasswordShown, setIsConfirmPasswordShown] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)

  // Vars
  const darkImg = '/images/pages/auth-mask-dark.png'
  const lightImg = '/images/pages/auth-mask-light.png'
  const darkIllustration = '/images/illustrations/auth/v2-register-dark.png'
  const lightIllustration = '/images/illustrations/auth/v2-register-light.png'
  const borderedDarkIllustration = '/images/illustrations/auth/v2-register-dark-border.png'
  const borderedLightIllustration = '/images/illustrations/auth/v2-register-light-border.png'

  // Hooks
  const searchParams = useSearchParams()
  const { lang: locale } = useParams()
  const { settings } = useSettings()
  const theme = useTheme()
  const hidden = useMediaQuery(theme.breakpoints.down('md'))
  const authBackground = useImageVariant(mode, lightImg, darkImg)

  const characterIllustration = useImageVariant(
    mode,
    lightIllustration,
    darkIllustration,
    borderedLightIllustration,
    borderedDarkIllustration
  )

  const token = searchParams.get('token')

  useEffect(() => {
    if (!token) {
      setError('Token de convite não fornecido')
      setLoading(false)

      return
    }

    fetch(`/api/apps/users/accept-invite?token=${encodeURIComponent(token)}`)
      .then(res => {
        if (!res.ok) {
          return res.json().then(data => {
            throw new Error(data.message || 'Token inválido')
          })
        }

        return res.json()
      })
      .then(data => {
        setInviteData(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [token])

  const handleSubmit = async e => {
    e.preventDefault()
    setError(null)

    if (!agreedToTerms) {
      setError('Você precisa aceitar os Termos de Uso')
      return
    }

    if (!name.trim()) {
      setError('Informe seu nome')

      return
    }

    if (password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres')

      return
    }

    if (password !== confirmPassword) {
      setError('As senhas não coincidem')

      return
    }

    setSubmitting(true)

    try {
      const res = await fetch('/api/apps/users/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name: name.trim(), password, termsAccepted: true })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.message || 'Erro ao aceitar convite')
      }

      setSuccess(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const renderContent = () => {
    if (loading) {
      return (
        <div className='flex flex-col items-center gap-4'>
          <CircularProgress />
          <Typography>Validando convite...</Typography>
        </div>
      )
    }

    if (success) {
      return (
        <div className='flex flex-col gap-4'>
          <Typography variant='h4'>Conta criada com sucesso!</Typography>
          <Typography>Sua conta foi ativada. Agora você pode fazer login.</Typography>
          <Button fullWidth variant='contained' component={Link} href={getLocalizedUrl('/login', locale)}>
            Ir para Login
          </Button>
        </div>
      )
    }

    if (error && !inviteData) {
      return (
        <div className='flex flex-col gap-4'>
          <Typography variant='h4' color='error'>
            Convite inválido
          </Typography>
          <Typography>{error}</Typography>
          <Button fullWidth variant='contained' component={Link} href={getLocalizedUrl('/login', locale)}>
            Ir para Login
          </Button>
        </div>
      )
    }

    return (
      <div className='flex flex-col gap-6 is-full sm:is-auto md:is-full sm:max-is-[400px] md:max-is-[unset] mbs-8 sm:mbs-11 md:mbs-0'>
        <div className='flex flex-col gap-1'>
          <Typography variant='h4'>Aceitar Convite</Typography>
          <Typography>
            Você foi convidado para o espaço de trabalho <strong>{inviteData?.workspaceName}</strong>
          </Typography>
        </div>
        {error && <Alert severity='error'>{error}</Alert>}
        <form noValidate autoComplete='off' onSubmit={handleSubmit} className='flex flex-col gap-6'>
          <CustomTextField fullWidth label='E-mail' value={inviteData?.email || ''} disabled />
          <CustomTextField
            autoFocus
            fullWidth
            label='Seu Nome'
            placeholder='João Silva'
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <CustomTextField
            fullWidth
            label='Senha'
            placeholder='Mínimo 6 caracteres'
            type={isPasswordShown ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position='end'>
                    <IconButton
                      edge='end'
                      onClick={() => setIsPasswordShown(!isPasswordShown)}
                      onMouseDown={e => e.preventDefault()}
                    >
                      <i className={isPasswordShown ? 'tabler-eye-off' : 'tabler-eye'} />
                    </IconButton>
                  </InputAdornment>
                )
              }
            }}
          />
          <CustomTextField
            fullWidth
            label='Confirmar Senha'
            placeholder='Repita a senha'
            type={isConfirmPasswordShown ? 'text' : 'password'}
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position='end'>
                    <IconButton
                      edge='end'
                      onClick={() => setIsConfirmPasswordShown(!isConfirmPasswordShown)}
                      onMouseDown={e => e.preventDefault()}
                    >
                      <i className={isConfirmPasswordShown ? 'tabler-eye-off' : 'tabler-eye'} />
                    </IconButton>
                  </InputAdornment>
                )
              }
            }}
          />
          <FormControlLabel
            control={<Checkbox checked={agreedToTerms} onChange={e => setAgreedToTerms(e.target.checked)} />}
            label={
              <>
                <span>Eu li e concordo com os </span>
                <Link className='text-primary' href={getLocalizedUrl('/pages/termos-de-uso', locale)} target='_blank'>
                  Termos de Uso
                </Link>
              </>
            }
          />
          <Button fullWidth variant='contained' type='submit' disabled={submitting || !agreedToTerms}>
            {submitting ? 'Criando conta...' : 'Aceitar Convite e Criar Conta'}
          </Button>
          <Button fullWidth variant='contained' type='submit' disabled={submitting}>
            {submitting ? 'Criando conta...' : 'Aceitar Convite e Criar Conta'}
          </Button>
        </form>
      </div>
    )
  }

  return (
    <div className='flex bs-full justify-center'>
      <div
        className={classnames(
          'flex bs-full items-center justify-center flex-1 min-bs-[100dvh] relative p-6 max-md:hidden',
          {
            'border-ie': settings.skin === 'bordered'
          }
        )}
      >
        <Illustration src={characterIllustration} alt='character-illustration' />
        {!hidden && <MaskImg alt='mask' src={authBackground} />}
      </div>
      <div className='flex justify-center items-center bs-full bg-backgroundPaper !min-is-full p-6 md:!min-is-[unset] md:p-12 md:is-[480px]'>
        <div className='absolute block-start-5 sm:block-start-[33px] inline-start-6 sm:inline-start-[38px]'>
          <Logo />
        </div>
        {renderContent()}
      </div>
    </div>
  )
}

export default AcceptInvite
