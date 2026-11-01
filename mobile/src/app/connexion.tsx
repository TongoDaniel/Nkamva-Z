import { useRef, useState } from 'react'
import { Image, StyleSheet, View, type TextInputInstance } from 'react-native'
import { Link } from 'expo-router'
import { useAuth } from '../lib/auth'
import { ApiError } from '../lib/api'
import { Screen } from '../ui/Screen'
import { Text } from '../ui/Text'
import { Field } from '../ui/Field'
import { Button } from '../ui/Button'
import { colors } from '../ui/theme'

export default function Connexion() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totp, setTotp] = useState('')
  const [needsTotp, setNeedsTotp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const passwordRef = useRef<TextInputInstance>(null)

  async function submit() {
    if (!email.trim() || !password) { setError('Renseigne ton adresse e-mail et ton mot de passe.'); return }
    setError(null)
    setLoading(true)
    try {
      await login({ email: email.trim(), password, ...(needsTotp ? { totp: totp.trim() } : {}) })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TWO_FACTOR_REQUIRED') {
        setNeedsTotp(true)
        setError(null)
      } else {
        setError(err instanceof ApiError ? err.message : 'Connexion impossible.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Screen keyboard edges={['bottom']} contentStyle={styles.content}>
      <View style={styles.brand}>
        <Image source={require('../../assets/marque/marque-256.png')} style={styles.logo} />
        <Text variant="display">Bon retour sur NKAMVA</Text>
        <Text variant="body">Retrouve tes ressources, tes communautés et tes lives.</Text>
      </View>

      <View style={styles.form}>
        <Field
          label="Adresse e-mail"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          placeholder="toi@exemple.com"
        />
        <Field
          ref={passwordRef}
          label="Mot de passe"
          value={password}
          onChangeText={setPassword}
          secret
          autoComplete="current-password"
          textContentType="password"
          returnKeyType={needsTotp ? 'next' : 'go'}
          onSubmitEditing={needsTotp ? undefined : submit}
        />
        {needsTotp ? (
          <Field
            label="Code de vérification"
            hint="Le code à 6 chiffres de ton application d’authentification."
            value={totp}
            onChangeText={setTotp}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={8}
            autoFocus
            returnKeyType="go"
            onSubmitEditing={submit}
          />
        ) : null}

        {error ? <Text variant="small" style={styles.error}>{error}</Text> : null}

        <Button label="Se connecter" onPress={submit} loading={loading} />
        <Link href="/mot-de-passe-oublie" asChild>
          <Button label="Mot de passe oublié ?" tone="ghost" />
        </Link>
      </View>

      <View style={styles.footer}>
        <Text variant="body">Pas encore de compte ?</Text>
        <Link href="/inscription" asChild>
          <Button label="Créer un compte" tone="secondary" />
        </Link>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', gap: 28 },
  brand: { gap: 10 },
  logo: { width: 56, height: 56, borderRadius: 14, marginBottom: 8 },
  form: { gap: 16 },
  error: { color: colors.danger },
  footer: { gap: 10, alignItems: 'stretch' },
})
