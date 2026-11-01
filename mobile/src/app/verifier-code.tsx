import { useState } from 'react'
import { View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { pendingSignup } from '../lib/pending-signup'
import { Screen } from '../ui/Screen'
import { Text } from '../ui/Text'
import { Field } from '../ui/Field'
import { Button } from '../ui/Button'
import { colors } from '../ui/theme'

export default function VerifierCode() {
  const { email = '' } = useLocalSearchParams<{ email: string }>()
  const { login } = useAuth()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit() {
    if (!/^\d{6}$/.test(code)) { setError('Le code fait 6 chiffres.'); return }
    setError(null)
    setLoading(true)
    try {
      await api.post('auth/verify-otp', { email, code, purpose: 'EMAIL_VERIFICATION' })
      const pending = pendingSignup.take()
      if (pending && pending.email === email) await login(pending)
      else router.replace('/connexion')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Vérification impossible.')
    } finally {
      setLoading(false)
    }
  }

  async function resend() {
    setError(null)
    try {
      await api.post('auth/otp', { email, purpose: 'EMAIL_VERIFICATION' })
      setInfo('Un nouveau code vient de partir.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Envoi impossible.')
    }
  }

  return (
    <Screen keyboard edges={['bottom']}>
      <View style={{ gap: 6 }}>
        <Text variant="title">Un code t’attend</Text>
        <Text variant="body">Nous avons envoyé un code à 6 chiffres à {email}. Il est valable 10 minutes.</Text>
      </View>
      <Field
        label="Code reçu par e-mail"
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        autoFocus
        error={error}
        style={{ letterSpacing: 8, fontSize: 22 }}
      />
      {info ? <Text variant="small" style={{ color: colors.success }}>{info}</Text> : null}
      <Button label="Vérifier" onPress={submit} loading={loading} />
      <Button label="Renvoyer le code" tone="ghost" onPress={resend} />
    </Screen>
  )
}
