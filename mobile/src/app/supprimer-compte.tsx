import { useState, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import { keys } from '../lib/queries'
import { formatDate } from '../lib/format'
import { Screen } from '../ui/Screen'
import { Text } from '../ui/Text'
import { Field } from '../ui/Field'
import { Button } from '../ui/Button'
import { AlertCircle, Check, X } from 'lucide-react-native'
import { colors } from '../ui/theme'

const CONFIRM_WORD = 'SUPPRIMER'

/**
 * Suppression du compte depuis l'app, comme l'exigent Apple et Google pour
 * toute app où l'on crée un compte. Le serveur applique ses propres règles
 * (`requestDeletion`) : délai de grâce de 30 jours, refus tant qu'il reste un
 * solde, un litige ou une communauté active. Ses messages de refus disent
 * quoi faire, on les affiche tels quels.
 */
export default function SupprimerCompte() {
  const queryClient = useQueryClient()
  const [word, setWord] = useState('')
  const [error, setError] = useState<{ code: string; message: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [scheduledAt, setScheduledAt] = useState<string | null>(null)

  async function submit(abandonResidue = false) {
    setError(null)
    setLoading(true)
    try {
      const result = await api.post<{ deletionScheduledAt: string }>('me/deletion', abandonResidue ? { abandonResidue: true } : {})
      setScheduledAt(result.deletionScheduledAt)
      void queryClient.invalidateQueries({ queryKey: keys.profile })
    } catch (err) {
      setError(err instanceof ApiError ? { code: err.code, message: err.message } : { code: '', message: 'Suppression impossible.' })
    } finally {
      setLoading(false)
    }
  }

  if (scheduledAt) {
    return (
      <Screen edges={['bottom']}>
        <Text variant="title">Suppression programmée</Text>
        <Text variant="body">
          Ton compte sera supprimé le {formatDate(scheduledAt)}. D’ici là, tu peux revenir sur ta décision depuis l’écran Compte.
        </Text>
        <Button label="Revenir au compte" onPress={() => router.back()} />
      </Screen>
    )
  }

  return (
    <Screen keyboard edges={['bottom']}>
      <View style={{ gap: 6 }}>
        <Text variant="title">Supprimer mon compte</Text>
        <Text variant="body">Tu disposes de 30 jours pour changer d’avis. Passé ce délai, la suppression est définitive.</Text>
      </View>

      {/* Deux listes simples, sans encadré beige : la page de suppression
          d'un compte Google procède de la même façon. */}
      <View style={styles.section}>
        <Text variant="heading">Ce qui disparaît</Text>
        <Point icon={<X size={18} color={colors.danger} />} text="Ton profil, tes messages et ta progression" />
        <Point icon={<X size={18} color={colors.danger} />} text="L’accès à tes ressources et à tes communautés" />
      </View>
      <View style={styles.section}>
        <Text variant="heading">Ce qui est conservé</Text>
        <Point icon={<Check size={18} color={colors.ink2} />} text="Les factures et les traces de paiement, que la loi impose de garder" />
      </View>

      <Field
        label={`Pour confirmer, écris ${CONFIRM_WORD}`}
        value={word}
        onChangeText={setWord}
        autoCapitalize="characters"
        autoCorrect={false}
      />

      {error ? (
        <View style={styles.refusal}>
          <View style={styles.point}>
            <AlertCircle size={18} color={colors.danger} style={{ marginTop: 1 }} />
            <Text variant="small" style={{ flex: 1, color: colors.ink }}>{error.message}</Text>
          </View>
          {error.code === 'WALLET_RESIDUE' ? (
            <Button label="Abandonner ce solde et supprimer" tone="danger" onPress={() => submit(true)} loading={loading} />
          ) : null}
        </View>
      ) : null}

      <Button
        label="Supprimer mon compte"
        tone="danger"
        disabled={word.trim().toUpperCase() !== CONFIRM_WORD}
        onPress={() => submit()}
        loading={loading}
      />
    </Screen>
  )
}

function Point({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <View style={styles.point}>
      {icon}
      <Text variant="body" style={{ flex: 1 }}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  point: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  refusal: { gap: 10 },
})
