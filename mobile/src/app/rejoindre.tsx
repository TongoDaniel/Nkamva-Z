import { useLocalSearchParams } from 'expo-router'
import { Heart, Flag, GraduationCap, Library, MessageCircle, Users, UserRound } from 'lucide-react-native'
import { Screen } from '../ui/Screen'
import { colors } from '../ui/theme'
import { AccountGate, REASONS, type AccountReason } from '../components/AccountGate'

const ICONS: Record<AccountReason, typeof Heart> = {
  favoris: Heart,
  bibliotheque: Library,
  messages: MessageCircle,
  signaler: Flag,
  communaute: Users,
  compte: UserRound,
  formateur: GraduationCap,
}

/**
 * Feuille ouverte quand un visiteur touche une action réservée aux comptes.
 * Elle se referme d'elle-même une fois le compte ouvert : les écrans des
 * visiteurs quittent la pile dès la connexion.
 */
export default function Rejoindre() {
  const { raison } = useLocalSearchParams<{ raison?: string }>()
  const reason: AccountReason = raison && raison in REASONS ? (raison as AccountReason) : 'compte'
  const Icon = ICONS[reason]
  return (
    <Screen edges={['bottom']} contentStyle={{ flexGrow: 1, justifyContent: 'center' }}>
      <AccountGate reason={reason} icon={<Icon color={colors.ink3} size={40} strokeWidth={1.5} />} />
    </Screen>
  )
}
