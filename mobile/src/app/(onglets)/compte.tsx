import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { AlertTriangle, ArrowLeftRight, Bell, ChevronRight, FileText, Heart, KeyRound, LifeBuoy, Lock, LogOut, Pencil, Radio, ShieldCheck, Trash2, Users } from 'lucide-react-native'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { keys } from '../../lib/queries'
import { formatDate } from '../../lib/format'
import { Button } from '../../ui/Button'
import type { ReactNode } from 'react'
import { useAuth } from '../../lib/auth'
import { useMode } from '../../lib/mode'
import { useProfile } from '../../lib/queries'
import { API_URL } from '../../lib/config'
import { openSitePage } from '../../lib/links'
import { Screen } from '../../ui/Screen'
import { Text } from '../../ui/Text'
import { Avatar, Card } from '../../ui/Bits'
import { colors } from '../../ui/theme'

function Item({ icon, label, onPress, danger }: { icon: ReactNode; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.paper }]} accessibilityRole="button">
      {icon}
      {/* Graisse normale, comme les Réglages iOS : le demi-gras sur chaque ligne alourdissait la liste. */}
      <Text variant="body" style={[{ flex: 1, color: colors.ink }, danger && { color: colors.danger }]}>{label}</Text>
      {danger ? null : <ChevronRight size={18} color={colors.hairline} />}
    </Pressable>
  )
}

export default function Compte() {
  const { logout } = useAuth()
  const { mode, setMode } = useMode()
  const profile = useProfile()
  const p = profile.data
  const queryClient = useQueryClient()

  function cancelDeletion() {
    api.del('me/deletion')
      .then(() => queryClient.invalidateQueries({ queryKey: keys.profile }))
      .catch((err) => Alert.alert('Annulation impossible', err instanceof Error ? err.message : ''))
  }

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

      {/* Bascule de mode, comme « Passer en mode hôte » chez Airbnb : un seul
          geste, et la barre d'onglets change. */}
      {p?.isTrainer ? (
        <Card style={styles.switch} onPress={() => { void setMode(mode === 'trainer' ? 'learner' : 'trainer') }}>
          <View style={styles.switchIcon}><ArrowLeftRight size={20} color={colors.ink} /></View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong">{mode === 'trainer' ? 'Passer en mode apprenant' : 'Passer en mode formateur'}</Text>
            <Text variant="caption">
              {mode === 'trainer' ? 'Ta bibliothèque, le catalogue et tes communautés.' : 'Tableau de bord, ventes, ressources et lives.'}
            </Text>
          </View>
          <ChevronRight size={18} color={colors.hairline} />
        </Card>
      ) : null}

      {p?.deletionScheduledAt ? (
        // Encadré blanc et icône d'alerte, comme les avertissements des
        // Réglages iOS : pas de texte rouge sur fond rose.
        <Card style={styles.deletion}>
          <View style={styles.deletionHead}>
            <AlertTriangle size={20} color={colors.danger} />
            <Text variant="bodyStrong" style={{ flex: 1 }}>Suppression programmée le {formatDate(p.deletionScheduledAt)}</Text>
          </View>
          <Text variant="small">Ton compte reste utilisable jusque-là. Tu peux encore changer d’avis.</Text>
          <Button label="Annuler la suppression" tone="secondary" onPress={cancelDeletion} />
        </Card>
      ) : null}

      <Card style={styles.group}>
        <Item icon={<Users size={20} color={colors.ink2} />} label="Mes communautés" onPress={() => router.push('/communautes')} />
        <View style={styles.sep} />
        <Item icon={<Heart size={20} color={colors.ink2} />} label="Mes favoris" onPress={() => router.push('/favoris')} />
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
        <Item icon={<LifeBuoy size={20} color={colors.ink2} />} label="Aide" onPress={() => openSitePage('/aide')} />
        <View style={styles.sep} />
        <Item icon={<FileText size={20} color={colors.ink2} />} label="Conditions générales" onPress={() => openSitePage('/legal/conditions')} />
        <View style={styles.sep} />
        <Item icon={<Lock size={20} color={colors.ink2} />} label="Confidentialité" onPress={() => openSitePage('/legal/confidentialite')} />
      </Card>

      <Card style={styles.group}>
        <Item icon={<LogOut size={20} color={colors.danger} />} label="Se déconnecter" onPress={confirmLogout} danger />
      </Card>

      {p?.deletionScheduledAt ? null : (
        <Pressable onPress={() => router.push('/supprimer-compte')} style={styles.deleteLink} accessibilityRole="button">
          <Trash2 size={16} color={colors.ink3} />
          <Text variant="small" style={{ color: colors.ink3 }}>Supprimer mon compte</Text>
        </Pressable>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  group: { overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 56 },
  switch: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  switchIcon: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  deletion: { padding: 16, gap: 10 },
  deletionHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  deleteLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  sep: { height: 1, backgroundColor: colors.line2, marginLeft: 50 },
})
