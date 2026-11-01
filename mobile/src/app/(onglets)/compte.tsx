import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { Bell, ChevronRight, Globe, KeyRound, LifeBuoy, LogOut, Pencil, Radio, ShieldCheck, Users } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { useAuth } from '../../lib/auth'
import { useProfile } from '../../lib/queries'
import { API_URL } from '../../lib/config'
import { Screen } from '../../ui/Screen'
import { Text } from '../../ui/Text'
import { Avatar, Card } from '../../ui/Bits'
import { colors } from '../../ui/theme'

function Item({ icon, label, onPress, danger }: { icon: ReactNode; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.paper }]} accessibilityRole="button">
      {icon}
      <Text variant="bodyStrong" style={[{ flex: 1 }, danger && { color: colors.danger }]}>{label}</Text>
      {danger ? null : <ChevronRight size={18} color={colors.hairline} />}
    </Pressable>
  )
}

export default function Compte() {
  const { logout } = useAuth()
  const profile = useProfile()
  const p = profile.data

  function confirmLogout() {
    Alert.alert('Se déconnecter ?', 'Tu pourras te reconnecter à tout moment.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: () => { void logout() } },
    ])
  }

  // Les réglages fins du compte (mot de passe, double authentification,
  // export et suppression des données) restent sur le site en V1 : ils
  // s'ouvrent dans le navigateur, déjà connectés ou non.
  const openWeb = (path: string) => { void Linking.openURL(`${API_URL}${path}`) }

  return (
    <Screen>
      <Text variant="title">Compte</Text>
      <Card style={styles.profile} onPress={() => router.push('/profil')}>
        <Avatar name={p?.fullName ?? null} size={60} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="heading" numberOfLines={1}>{p?.fullName ?? ' '}</Text>
          <Text variant="small" numberOfLines={1}>{p?.email ?? ''}</Text>
          {p?.isTrainer ? <Text variant="caption" style={{ color: colors.brand }}>Formateur</Text> : null}
        </View>
        <Pencil size={18} color={colors.ink3} />
      </Card>

      <Card style={styles.group}>
        <Item icon={<Users size={20} color={colors.ink2} />} label="Mes communautés" onPress={() => router.push('/communautes')} />
        <View style={styles.sep} />
        <Item icon={<Bell size={20} color={colors.ink2} />} label="Notifications" onPress={() => router.push('/notifications')} />
        <View style={styles.sep} />
        <Item icon={<Radio size={20} color={colors.ink2} />} label="Agenda des lives" onPress={() => router.push('/lives')} />
      </Card>

      <Card style={styles.group}>
        <Item icon={<KeyRound size={20} color={colors.ink2} />} label="Mot de passe" onPress={() => router.push('/mot-de-passe')} />
        <View style={styles.sep} />
        <Item icon={<ShieldCheck size={20} color={colors.ink2} />} label="Sécurité et données" onPress={() => openWeb('/mon-compte')} />
        <View style={styles.sep} />
        <Item icon={<LifeBuoy size={20} color={colors.ink2} />} label="Aide" onPress={() => openWeb('/aide')} />
        <View style={styles.sep} />
        <Item icon={<Globe size={20} color={colors.ink2} />} label="Conditions et confidentialité" onPress={() => openWeb('/legal')} />
      </Card>

      <Card style={styles.group}>
        <Item icon={<LogOut size={20} color={colors.danger} />} label="Se déconnecter" onPress={confirmLogout} danger />
      </Card>
    </Screen>
  )
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  group: { overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 56 },
  sep: { height: 1, backgroundColor: colors.line2, marginLeft: 50 },
})
