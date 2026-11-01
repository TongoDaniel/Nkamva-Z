import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Link, router } from 'expo-router'
import { Bell, BookOpen } from 'lucide-react-native'
import { useCatalog, useLives, useMyCommunities, useNotifications, useProfile, useResources } from '../../lib/queries'
import { CommunityCard } from '../../components/CommunityCard'
import { firstName } from '../../lib/format'
import { Screen } from '../../ui/Screen'
import { Text } from '../../ui/Text'
import { Button } from '../../ui/Button'
import { Divider, SectionTitle } from '../../ui/Bits'
import { EmptyState } from '../../ui/States'
import { colors } from '../../ui/theme'
import { CourseCard, LiveCard, ResourceRow } from '../../components/cards'
import { Bone, CourseCardSkeleton, LiveCardSkeleton, Repeat, ResourceRowSkeleton } from '../../ui/Skeleton'

export default function Accueil() {
  const profile = useProfile()
  const resources = useResources()
  const lives = useLives()
  const notifications = useNotifications()
  const discover = useCatalog('', null)
  const communities = useMyCommunities()

  const unread = Number(notifications.data?.meta?.unread ?? 0)
  const owned = new Set(resources.data?.map((r) => r.courseId))
  // « Reprendre » : ce qui a été ouvert, le plus récent d'abord.
  const resume = (resources.data ?? [])
    .filter((r) => r.course && !r.accessSuspended)
    .sort((a, b) => (b.courseView?.lastViewedAt ?? b.createdAt).localeCompare(a.courseView?.lastViewedAt ?? a.createdAt))
    .slice(0, 3)
  const upcoming = (lives.data ?? []).filter((l) => l.status === 'SCHEDULED' || l.status === 'LIVE').slice(0, 2)
  const suggestions = (discover.data?.pages[0]?.data ?? []).filter((c) => !owned.has(c.id)).slice(0, 6)

  const refreshing = resources.isRefetching || lives.isRefetching
  const refresh = () => { void communities.refetch(); void resources.refetch(); void lives.refetch(); void notifications.refetch(); void profile.refetch() }

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text variant="caption">NKAMVA</Text>
          {profile.isLoading ? (
            <Bone width={200} height={28} style={{ marginTop: 4 }} />
          ) : (
            <Text variant="title">Bonjour{profile.data?.fullName ? ` ${firstName(profile.data.preferredName || profile.data.fullName)}` : ''}</Text>
          )}
        </View>
        <Pressable
          onPress={() => router.push('/notifications')}
          accessibilityRole="button"
          accessibilityLabel={unread ? `Notifications, ${unread} non lues` : 'Notifications'}
          style={styles.bell}
          hitSlop={8}
        >
          <Bell color={colors.ink} size={22} />
          {unread > 0 ? <View style={styles.dot} /> : null}
        </Pressable>
      </View>

      <View>
        <SectionTitle title="Reprendre" action={resume.length ? <Link href="/bibliotheque"><Text variant="label" style={{ color: colors.brand }}>Tout voir</Text></Link> : undefined} />
        {resume.length ? (
          resume.map((item, i) => (
            <View key={item.id}>
              {i > 0 ? <Divider inset={86} /> : null}
              <ResourceRow item={item} />
            </View>
          ))
        ) : resources.isLoading ? (
          <Repeat count={3}><ResourceRowSkeleton /></Repeat>
        ) : (
          <EmptyState
            icon={<BookOpen color={colors.brand} />}
            title="Ta bibliothèque est vide"
            body="Les ressources et les communautés que tu rejoins apparaissent ici."
            action={<Button label="Explorer le catalogue" tone="secondary" onPress={() => router.push('/explorer')} />}
          />
        )}
      </View>

      {communities.data?.length ? (
        <View>
          <SectionTitle title="Mes communautés" action={communities.data.length > 2 ? <Link href="/communautes"><Text variant="label" style={{ color: colors.brand }}>Tout voir</Text></Link> : undefined} />
          <View style={{ gap: 10 }}>
            {communities.data.slice(0, 2).map((c) => <CommunityCard key={c.subscriptionId} item={c} />)}
          </View>
        </View>
      ) : null}

      {lives.isLoading ? (
        <View>
          <Bone width={160} height={20} style={{ marginBottom: 12 }} />
          <LiveCardSkeleton />
        </View>
      ) : null}

      {upcoming.length ? (
        <View>
          <SectionTitle title="Prochains lives" action={<Link href="/lives"><Text variant="label" style={{ color: colors.brand }}>Agenda</Text></Link>} />
          <View style={{ gap: 12 }}>
            {upcoming.map((s) => <LiveCard key={s.id} session={s} />)}
          </View>
        </View>
      ) : null}

      {discover.isLoading ? (
        <View>
          <Bone width={140} height={20} style={{ marginBottom: 12 }} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <CourseCardSkeleton width={168} />
            <CourseCardSkeleton width={168} />
          </View>
        </View>
      ) : null}

      {suggestions.length ? (
        <View>
          <SectionTitle title="À découvrir" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }} style={{ marginHorizontal: -20 }}>
            {suggestions.map((c) => <CourseCard key={c.id} course={c} width={168} />)}
          </ScrollView>
        </View>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bell: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 10, right: 11, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.clay, borderWidth: 2, borderColor: colors.paper },
})
