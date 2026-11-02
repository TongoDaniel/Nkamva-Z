import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useAuth } from '../lib/auth'
import { Text } from '../ui/Text'
import { Button } from '../ui/Button'
import { colors } from '../ui/theme'

/** Pourquoi on demande un compte : le texte dit ce que le compte va débloquer. */
export type AccountReason = 'favoris' | 'bibliotheque' | 'messages' | 'signaler' | 'communaute' | 'compte' | 'formateur'

export const REASONS: Record<AccountReason, { title: string; body: string }> = {
  favoris: { title: 'Garde cette ressource pour plus tard', body: 'Crée ton compte pour retrouver tes favoris sur tous tes appareils.' },
  bibliotheque: { title: 'Ta bibliothèque t’attend', body: 'Tes ressources et celles de tes communautés se rangent ici, avec ta progression, même hors ligne.' },
  messages: { title: 'Échange avec les formateurs', body: 'Les groupes de tes communautés et tes discussions avec les formateurs apparaissent ici.' },
  signaler: { title: 'Connecte-toi pour signaler', body: 'Un signalement est rattaché à un compte : c’est ce qui permet à l’équipe de modération de le traiter.' },
  communaute: { title: 'Rejoins la conversation', body: 'Crée ton compte : une fois membre, tu retrouves ici le groupe, les lives et les ressources incluses.' },
  formateur: { title: 'Deviens formateur NKAMVA', body: 'Crée d’abord ton compte : ta candidature s’y rattache, et tu la reprends quand tu veux, ici ou sur le site.' },
  compte: { title: 'Ton espace NKAMVA', body: 'Ta progression, tes favoris et tes communautés, sur ton téléphone comme sur le site.' },
}

/**
 * Demande de compte au moment où il sert, sur le modèle d'Airbnb (le cœur des
 * favoris) et de Duolingo (le compte après la première leçon) : le visiteur
 * sait ce qu'il gagne à s'inscrire. Jamais en barrage à l'ouverture de l'app.
 */
export function AccountGate({ reason, icon, children }: { reason: AccountReason; icon?: ReactNode; children?: ReactNode }) {
  const r = REASONS[reason]
  return (
    <View style={styles.wrap}>
      {icon ? <View style={{ marginBottom: 6 }}>{icon}</View> : null}
      <Text variant="heading" style={styles.center}>{r.title}</Text>
      <Text variant="body" style={styles.center}>{r.body}</Text>
      <View style={styles.actions}>
        <Button label="Créer un compte" onPress={() => router.push('/inscription')} />
        <Button label="J’ai déjà un compte" tone="secondary" onPress={() => router.push('/connexion')} />
      </View>
      {children}
    </View>
  )
}

/**
 * Pour une action réservée aux comptes (cœur, signalement) : la fait si l'on
 * est connecté, sinon ouvre la demande de compte expliquée.
 */
export function useRequireAccount() {
  const { status } = useAuth()
  return (reason: AccountReason, action: () => void) => {
    if (status === 'signedIn') action()
    else router.push({ pathname: '/rejoindre', params: { raison: reason } })
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8, minHeight: 360 },
  center: { textAlign: 'center' },
  actions: { alignSelf: 'stretch', gap: 10, marginTop: 14 },
})

export const gateColors = { icon: colors.ink3 }
