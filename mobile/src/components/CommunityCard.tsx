import { StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { Lock, Users } from 'lucide-react-native'
import { Card } from '../ui/Bits'
import { Text } from '../ui/Text'
import { colors, radius } from '../ui/theme'
import type { MyCommunity } from '../lib/types'

/** Une communauté dont on est membre : nom, animateur, membres, état de l'adhésion. */
export function CommunityCard({ item, width }: { item: MyCommunity; width?: number }) {
  const c = item.community
  const pastDue = item.status === 'PAST_DUE'
  return (
    <Card style={width ? { ...styles.card, width } : styles.card} onPress={() => router.push({ pathname: '/communaute/[slug]', params: { slug: c.slug } })}>
      <View style={styles.icon}>
        <Users size={22} color={colors.brand} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.row}>
          <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>{c.name}</Text>
          {c.visibility === 'PRIVATE' ? <Lock size={14} color={colors.ink3} /> : null}
        </View>
        <Text variant="caption" numberOfLines={1}>
          {c.trainerName ?? 'Formateur NKAMVA'} · {c.membersCount} membre{c.membersCount > 1 ? 's' : ''}
        </Text>
        {pastDue ? <Text variant="caption" style={{ color: colors.goldInk }}>Renouvellement en attente</Text> : null}
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  icon: { width: 46, height: 46, borderRadius: radius.md - 2, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
})
