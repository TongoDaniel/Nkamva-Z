import { useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { api, ApiError } from '../lib/api'
import { Screen } from '../ui/Screen'
import { Text } from '../ui/Text'
import { Field } from '../ui/Field'
import { CodeInput } from '../ui/CodeInput'
import { Button } from '../ui/Button'
import { colors } from '../ui/theme'

/**
 * Deux temps sur un seul écran : l'adresse, puis le code et le nouveau mot de
 * passe. La réponse du serveur est la même que le compte existe ou non : on ne
 * dit jamais « adresse inconnue ».
 */
export default function MotDePasseOublie() {
  const [step, setStep] = useState<'email' | 'reset'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  async function sendCode() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Adresse e-mail invalide.'); return }
    setError(null)
    setLoading(true)
    try {
      await api.post('auth/otp', { email: email.trim(), purpose: 'PASSWORD_RESET' })
      setStep('reset')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Envoi impossible.')
    } finally {
      setLoading(false)
    }
  }

  async function reset() {
    setError(null)
    setLoading(true)
    try {
      await api.post('auth/reset-password', { email: email.trim(), code, password })
      setDone(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Réinitialisation impossible.')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <Screen edges={['bottom']}>
        <Text variant="title">Mot de passe changé</Text>
        <Text variant="body">Tu peux te connecter avec ton nouveau mot de passe.</Text>
        <Button label="Se connecter" onPress={() => router.replace('/connexion')} />
      </Screen>
    )
  }

  return (
    <Screen keyboard edges={['bottom']}>
      {step === 'email' ? (
        <>
          <View style={{ gap: 6 }}>
            <Text variant="title">On t’envoie un code</Text>
            <Text variant="body">Saisis l’adresse de ton compte. Si elle est connue, un code à 6 chiffres y arrive dans la minute.</Text>
          </View>
          <Field
            label="Adresse e-mail"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            error={error}
          />
          <Button label="Recevoir un code" onPress={sendCode} loading={loading} />
        </>
      ) : (
        <>
          <View style={{ gap: 6 }}>
            <Text variant="title">Nouveau mot de passe</Text>
            <Text variant="body">Code envoyé à {email.trim()}.</Text>
          </View>
          <CodeInput label="Code reçu" value={code} onChange={setCode} autoFocus />
          <Field label="Nouveau mot de passe" value={password} onChangeText={setPassword} secret autoComplete="new-password" hint="10 caractères minimum." />
          {error ? <Text variant="small" style={{ color: colors.danger }}>{error}</Text> : null}
          <Button label="Changer mon mot de passe" onPress={reset} loading={loading} />
          <Button label="Renvoyer un code" tone="ghost" onPress={sendCode} />
        </>
      )}
    </Screen>
  )
}
