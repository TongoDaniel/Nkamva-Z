import type { Metadata } from 'next'
import { ResetPasswordFlow } from './reset-password-flow'

export const metadata: Metadata = {
  title: 'Mot de passe oublié — NkamVa',
  description: 'Réinitialisez le mot de passe de votre compte NkamVa.',
}

export default function ForgotPasswordPage() {
  return <ResetPasswordFlow />
}
