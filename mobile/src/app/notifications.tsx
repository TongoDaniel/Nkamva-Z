import { useEffect } from 'react'
import { FlatList, Pressable, StyleSheet, View } from 'react-native'
import { Bell, ChevronRight } from 'lucide-react-native'
import { openSiteLink } from '../lib/links'
import { useMarkNotificationsRead, useNotifications } from '../lib/queries'
import { formatRelative } from '../lib/format'
import { Text } from '../ui/Text'
import { EmptyState, ErrorState } from '../ui/States'
import { Bone, Repeat } from '../ui/Skeleton'
import { colors } from '../ui/theme'

export default function Notifications() {
  const notifications = useNotifications()
  const markRead = useMarkNotificationsRead()
  const items = notifications.data?.data ?? []
  const unread = Number(notifications.data?.meta?.unread ?? 0)

  // Comme sur le site : ouvrir la liste vaut lecture.
  useEffect(() => {
    if (unread > 0 && !markRead.isPending) markRead.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread])

  if (notifications.isLoading) {
    return (
      <View style={{ backgroundColor: colors.background, flex: 1 }}>
        <Repeat count={5}>
          <View style={styles.skeleton}>
            <Bone width="70%" height={16} />
            <Bone width="95%" />
            <Bone width="30%" height={12} />
          </View>
        </Repeat>
      </View>
    )
  }
  if (notifications.isError) return <ErrorState message={(notifications.error as Error).message} onRetry={() => notifications.refetch()} />

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      data={items}
      keyExtractor={(n) => n.id}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshing={notifications.isRefetching}
      onRefresh={() => notifications.refetch()}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => openSiteLink(item.link)}
          disabled={!item.link}
          style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.paper }]}
        >
          <View style={[styles.dot, { backgroundColor: item.readAt ? 'transparent' : colors.brand }]} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text variant="bodyStrong" style={item.readAt ? styles.read : undefined}>{item.title}</Text>
            {item.body ? <Text variant="small">{item.body}</Text> : null}
            <Text variant="caption">{formatRelative(item.createdAt)}</Text>
          </View>
          {item.link ? <ChevronRight size={18} color={colors.hairline} style={{ alignSelf: 'center' }} /> : null}
        </Pressable>
      )}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
      ListEmptyComponent={<EmptyState icon={<Bell color={colors.ink3} size={40} strokeWidth={1.5} />} title="Aucune notification" body="Les nouvelles de tes communautés, de tes ressources et de ton compte s’affichent ici." />}
    />
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 16 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 8 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: 40 },
  // Non lue : point bleu et titre gras, comme dans Mail. Lue : titre normal.
  read: { fontFamily: 'InstrumentSans_500Medium' },
  skeleton: { paddingLeft: 40, paddingRight: 20, paddingVertical: 16, gap: 8 },
})
