import { FlatList, Pressable, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { MessageCircle, Users } from 'lucide-react-native'
import { useConversations } from '../../lib/queries'
import { formatRelative } from '../../lib/format'
import { Text } from '../../ui/Text'
import { Avatar, Divider } from '../../ui/Bits'
import { EmptyState, ErrorState } from '../../ui/States'
import { ConversationSkeleton, Repeat } from '../../ui/Skeleton'
import { colors } from '../../ui/theme'
import type { ConversationSummary } from '../../lib/types'

function preview(c: ConversationSummary): string {
  const m = c.lastMessage
  if (!m) return 'Aucun message pour l’instant'
  if (m.deleted) return 'Message supprimé'
  const who = m.mine ? 'Toi' : c.kind === 'GROUP' ? m.authorName : null
  return who ? `${who} : ${m.body}` : m.body
}

function Row({ c }: { c: ConversationSummary }) {
  const unread = c.unreadCount > 0
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/conversation/[id]', params: { id: c.id, title: c.title } })}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.paper }]}
      accessibilityRole="button"
    >
      {c.kind === 'GROUP' ? (
        <View style={styles.group}><Users color={colors.brand} size={22} /></View>
      ) : (
        <Avatar name={c.peer?.name ?? c.title} size={48} />
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.top}>
          <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>{c.title}</Text>
          {c.lastMessage ? <Text variant="caption">{formatRelative(c.lastMessage.createdAt)}</Text> : null}
        </View>
        <View style={styles.top}>
          <Text variant="small" numberOfLines={1} style={[{ flex: 1 }, unread && { color: colors.ink, fontFamily: 'InstrumentSans_600SemiBold' }]}>
            {preview(c)}
          </Text>
          {unread ? (
            <View style={styles.badge}><Text variant="caption" style={{ color: '#fff', fontFamily: 'InstrumentSans_700Bold' }}>{c.unreadCount > 99 ? '99+' : c.unreadCount}</Text></View>
          ) : null}
        </View>
        {c.kind === 'DIRECT' ? <Text variant="caption">{c.communityName}</Text> : null}
      </View>
    </Pressable>
  )
}

export default function Messages() {
  const conversations = useConversations()
  return (
    <SafeAreaView edges={['top']} style={styles.fill}>
      <View style={styles.head}><Text variant="title">Messages</Text></View>
      {conversations.isLoading ? (
        <View><Repeat count={6}><ConversationSkeleton /></Repeat></View>
      ) : conversations.isError ? (
        <ErrorState message={(conversations.error as Error).message} onRetry={() => conversations.refetch()} />
      ) : (
        <FlatList
          data={conversations.data}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => <Row c={item} />}
          ItemSeparatorComponent={() => <Divider inset={82} />}
          refreshing={conversations.isRefetching}
          onRefresh={() => conversations.refetch()}
          ListEmptyComponent={
            <EmptyState
              icon={<MessageCircle color={colors.brand} />}
              title="Pas encore de conversation"
              body="Les groupes de tes communautés et tes échanges avec les formateurs apparaissent ici."
            />
          }
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
  head: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  row: { flexDirection: 'row', gap: 14, paddingHorizontal: 20, paddingVertical: 14, alignItems: 'center' },
  group: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
})
