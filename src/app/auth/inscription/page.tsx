import type { Metadata } from 'next'
import { RegisterFlow } from './register-flow'

export const metadata: Metadata = {
  title: 'Créer un compte — NkamVa',
  description: 'Créez votre compte NkamVa pour accéder aux ressources des formateurs.',
}

export default function RegisterPage() {
  return <RegisterFlow />
}
