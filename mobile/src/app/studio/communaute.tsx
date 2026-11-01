import { FlatList, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { MessageCircle, UserPlus, Users } from 'lucide-react-native'
import { formatDate } from '../../lib/format'
import { useCommunityMembers, useTrainerCommunity, type CommunityMember } from '../../lib/studio'
import { Text } from '../../ui/Text'
import { Button } from '../../ui/Button'
import { Avatar, CommunityAvatar, Divider } from '../../ui/Bits'
import { EmptyState, ErrorState } from '../../ui/States'
import { Bone, Repeat } from '../../ui/Skeleton'
import { colors } from '../../ui/theme'
import { openTrainerPage } from '../../components/studio'

const ORDER: Record<CommunityMember['status'], number> = { ACTIVE: 0, PAST_DUE: 1, CANCELED: 2, EXPIRED: 3, BANNED: 4 }

function memberStatus(m: CommunityMember): { text: string; color: string } {
  switch (m.status) {
    case 'ACTIVE':
      return m.canceledAt
        ? { text: `Résiliée · accès jusqu’au ${formatDate(m.periodEnd)}`, color: colors.ink3 }
        : { text: `Membre depuis le ${formatDate(m.joinedAt)}`, color: colors.ink3 }
    case 'PAST_DUE': return { text: 'Renouvellement en attente', color: colors.goldInk }
    case 'BANNED': return { text: 'Parole retirée', color: colors.danger }
    case 'CANCELED': return { text: 'Partie', color: colors.ink3 }
    default: return { text: 'Adhésion expirée', color: colors.ink3 }
  }
}

/**
 * La communauté vue de son animateur : qui en fait partie et dans quel état
 * est son adhésion, comme la liste des membres d'un groupe WhatsApp. Inviter
 * et modérer (retirer la parole, avec un motif montré au membre) restent sur
 * le site.
 */
export default function MaCommunaute() {
  const community = useTrainerCommunity()
  const c = community.data
  const members = useCommunityMembers(c?.id)
  const list = [...(members.data ?? [])].sort((a, b) => ORDER[a.status] - ORDER[b.status])
  const active = list.filter((m) => m.status === 'ACTIVE' || m.status === 'PAST_DUE').length

  if (community.isLoading) {
    return <View style={styles.page}><Bone height={64} /><Repeat count={4}><Bone height={48} style={{ marginTop: 16 }} /></Repeat></View>
  }
  if (community.isError) return <ErrorState message={(community.error as Error).message} onRetry={() => community.refetch()} />
  if (!c) {
    return (
      <EmptyState
        icon={<Users color={colors.ink3} size={40} strokeWidth={1.5} />}
        title="Pas encore de communauté"
        body="Ouvre ta communauté depuis le site : tes membres, ton groupe et tes lives apparaîtront ici."
        action={<Button label="Ouvrir sur le site" tone="secondary" onPress={() => openTrainerPage('/formateur/communaute')} />}
      />
    )
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.page}
      data={list}
      keyExtractor={(m) => m.learnerId}
      refreshing={members.isRefetching}
      onRefresh={() => { void community.refetch(); void members.refetch() }}
      ListHeaderComponent={
        <View style={{ gap: 16, marginBottom: 12 }}>
          <View style={styles.head}>
            <CommunityAvatar name={c.name} size={64} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="title" numberOfLines={2}>{c.name}</Text>
              <Text variant="small">{active} membre{active > 1 ? 's' : ''} actif{active > 1 ? 's' : ''}</Text>
            </View>
          </View>
          <View style={{ gap: 10 }}>
            <Button
              label="Voir la communauté"
              icon={<MessageCircle size={18} color="#fff" />}
              onPress={() => router.push({ pathname: '/communaute/[slug]', params: { slug: c.slug } })}
            />
            <Button label="Inviter des membres" tone="secondary" icon={<UserPlus size={18} color={colors.ink} />} onPress={() => openTrainerPage('/formateur/communaute')} />
          </View>
          <Text variant="heading" style={{ marginTop: 8 }}>Membres</Text>
        </View>
      }
      renderItem={({ item }) => {
        const s = memberStatus(item)
        return (
          <View style={styles.row}>
            <Avatar name={item.fullName} size={44} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong" numberOfLines={1}>{item.fullName ?? 'Membre'}</Text>
              <Text variant="caption" style={{ color: s.color }}>{s.text}{item.viaInvitation ? ' · invité' : ''}</Text>
            </View>
          </View>
        )
      }}
      ItemSeparatorComponent={() => <Divider inset={58} />}
      ListEmptyComponent={
        members.isLoading
          ? <Repeat count={4}><Bone height={44} style={{ marginBottom: 14 }} /></Repeat>
          : <Text variant="small">Aucun membre pour l’instant. Partage le lien de ta communauté ou invite tes premiers membres.</Text>
      }
    />
  )
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 40 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 },
})
