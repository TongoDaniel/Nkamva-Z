import { useState } from 'react'
import { FlatList, Pressable, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Library } from 'lucide-react-native'
import { useResources } from '../../lib/queries'
import { Text } from '../../ui/Text'
import { Button } from '../../ui/Button'
import { EmptyState, ErrorState } from '../../ui/States'
import { Repeat, ResourceRowSkeleton } from '../../ui/Skeleton'
import { colors, radius } from '../../ui/theme'
import { Divider } from '../../ui/Bits'
import { ResourceRow, readingPercent } from '../../components/cards'
import type { ResourceItem } from '../../lib/types'

type Filter = 'all' | 'progress' | 'done'

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'Tout' },
  { key: 'progress', label: 'En cours' },
  { key: 'done', label: 'Terminé' },
]

function matches(item: ResourceItem, filter: Filter) {
  if (filter === 'all') return true
  const p = readingPercent(item)
  if (filter === 'done') return p === 100
  return item.isStarted && p !== 100
}

export default function Bibliotheque() {
  const resources = useResources()
  const [filter, setFilter] = useState<Filter>('all')
  const items = (resources.data ?? []).filter((r) => r.course && matches(r, filter))

  return (
    <SafeAreaView edges={['top']} style={styles.fill}>
      <View style={styles.head}>
        <Text variant="title">Bibliothèque</Text>
        <View style={styles.segment}>
          {FILTERS.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.segmentItem, filter === f.key && styles.segmentActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === f.key }}
            >
              <Text variant="label" style={{ color: filter === f.key ? colors.ink : colors.ink3 }}>{f.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {resources.isLoading ? (
        <View style={styles.list}><Repeat count={6}><ResourceRowSkeleton /></Repeat></View>
      ) : resources.isError ? (
        <ErrorState message={(resources.error as Error).message} onRetry={() => resources.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <ResourceRow item={item} />}
          ItemSeparatorComponent={() => <Divider inset={86} />}
          refreshing={resources.isRefetching}
          onRefresh={() => resources.refetch()}
          ListEmptyComponent={
            filter === 'all' ? (
              <EmptyState
                icon={<Library color={colors.brand} />}
                title="Rien pour l’instant"
                body="Tes ressources, achetées ou incluses dans tes communautés, se rangent ici."
                action={<Button label="Explorer" tone="secondary" onPress={() => router.push('/explorer')} />}
              />
            ) : (
              <EmptyState title={filter === 'done' ? 'Aucune ressource terminée' : 'Aucune ressource en cours'} />
            )
          }
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
  head: { paddingHorizontal: 20, paddingTop: 20, gap: 14 },
  segment: { flexDirection: 'row', backgroundColor: colors.paper, borderRadius: radius.pill, padding: 4 },
  segmentItem: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  segmentActive: { backgroundColor: colors.card, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
  list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
  sep: { height: 1, backgroundColor: colors.line2 },
})
