import { redirect } from 'next/navigation'

const RegisterPage = async () => {
  redirect('/login')
}

export default RegisterPage
