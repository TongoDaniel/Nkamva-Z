import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { api, ApiError } from '../lib/api'
import { pendingSignup } from '../lib/pending-signup'
import { Screen } from '../ui/Screen'
import { Text } from '../ui/Text'
import { Field } from '../ui/Field'
import { Button } from '../ui/Button'
import { colors } from '../ui/theme'

/** Même plancher que le serveur (`MIN_PASSWORD_LENGTH`). */
const MIN_PASSWORD = 10

export default function Inscription() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  async function submit() {
    const next: Record<string, string> = {}
    if (fullName.trim().split(/\s+/).length < 2) next.fullName = 'Indique ton prénom et ton nom.'
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = 'Adresse e-mail invalide.'
    if (password.length < MIN_PASSWORD) next.password = `Au moins ${MIN_PASSWORD} caractères.`
    setErrors(next)
    if (Object.keys(next).length) return

    setLoading(true)
    try {
      const result = await api.post<{ email: string }>('auth/register', {
        fullName: fullName.trim(),
        email: email.trim(),
        password,
      })
      pendingSignup.set({ email: result.email, password })
      router.replace({ pathname: '/verifier-code', params: { email: result.email } })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PASSWORD_BREACHED') setErrors({ password: err.message })
      else setErrors({ form: err instanceof ApiError ? err.message : 'Inscription impossible.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Screen keyboard edges={['bottom']}>
      <View style={{ gap: 6 }}>
        <Text variant="title">Bienvenue</Text>
        <Text variant="body">Crée ton compte pour apprendre avec les formateurs NKAMVA.</Text>
      </View>
      <Field label="Prénom et nom" value={fullName} onChangeText={setFullName} autoComplete="name" textContentType="name" error={errors.fullName} />
      <Field
        label="Adresse e-mail"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        error={errors.email}
      />
      <Field
        label="Mot de passe"
        value={password}
        onChangeText={setPassword}
        secret
        autoComplete="new-password"
        textContentType="newPassword"
        hint={`${MIN_PASSWORD} caractères minimum.`}
        error={errors.password}
      />
      {errors.form ? <Text variant="small" style={{ color: colors.danger }}>{errors.form}</Text> : null}
      <Button label="Créer mon compte" onPress={submit} loading={loading} />
      <Text variant="caption" style={styles.legal}>
        En créant un compte, tu acceptes les conditions générales et la politique de confidentialité de NKAMVA.
      </Text>
    </Screen>
  )
}

const styles = StyleSheet.create({
  legal: { textAlign: 'center' },
})
