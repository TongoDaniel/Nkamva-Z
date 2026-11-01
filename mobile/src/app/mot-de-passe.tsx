import { useState } from 'react'
import { Alert, View } from 'react-native'
import { router } from 'expo-router'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Screen } from '../ui/Screen'
import { Text } from '../ui/Text'
import { Field } from '../ui/Field'
import { Button } from '../ui/Button'
import { colors } from '../ui/theme'

/** Même plancher que le serveur (`MIN_PASSWORD_LENGTH`). */
const MIN_PASSWORD = 10

/**
 * Changer son mot de passe ferme toutes les sessions ouvertes, celle de l'app
 * comprise (`sessionsValidAfter`). On rouvre donc aussitôt la session de ce
 * téléphone avec le nouveau mot de passe, sans renvoyer à la connexion.
 */
export default function MotDePasse() {
  const { user, login } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit() {
    if (next.length < MIN_PASSWORD) { setError(`Le nouveau mot de passe doit contenir au moins ${MIN_PASSWORD} caractères.`); return }
    if (next !== confirm) { setError('Les deux nouveaux mots de passe ne correspondent pas.'); return }
    setError(null)
    setLoading(true)
    try {
      await api.post('me/password', { currentPassword: current, newPassword: next })
      if (user?.email) await login({ email: user.email, password: next })
      Alert.alert('Mot de passe changé', 'Tes autres appareils devront se reconnecter.')
      router.back()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Changement impossible.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Screen keyboard edges={['bottom']}>
      <View style={{ gap: 6 }}>
        <Text variant="body">Après le changement, tes autres appareils devront se reconnecter. Celui-ci reste connecté.</Text>
      </View>
      <Field label="Mot de passe actuel" value={current} onChangeText={setCurrent} secret autoComplete="current-password" textContentType="password" />
      <Field label="Nouveau mot de passe" value={next} onChangeText={setNext} secret autoComplete="new-password" textContentType="newPassword" hint={`${MIN_PASSWORD} caractères minimum.`} />
      <Field label="Confirmer le nouveau mot de passe" value={confirm} onChangeText={setConfirm} secret autoComplete="new-password" textContentType="newPassword" />
      {error ? <Text variant="small" style={{ color: colors.danger }}>{error}</Text> : null}
      <Button label="Changer le mot de passe" onPress={submit} loading={loading} />
    </Screen>
  )
}
