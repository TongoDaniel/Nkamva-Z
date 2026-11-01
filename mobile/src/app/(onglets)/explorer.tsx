import { useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Search, WifiOff, X } from 'lucide-react-native'
import { useCatalog, useResources } from '../../lib/queries'
import { FORMAT_LABELS } from '../../lib/format'
import { Text } from '../../ui/Text'
import { EmptyState, ErrorState } from '../../ui/States'
import { CourseCardSkeleton, Repeat } from '../../ui/Skeleton'
import { colors, fonts, radius } from '../../ui/theme'
import { CourseCard } from '../../components/cards'

const FORMATS = Object.entries(FORMAT_LABELS)
const GAP = 12

function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export default function Explorer() {
  const [query, setQuery] = useState('')
  const [format, setFormat] = useState<string | null>(null)
  const search = useDebounced(query.trim())
  const catalog = useCatalog(search, format)
  const resources = useResources()
  const owned = new Set(resources.data?.map((r) => r.courseId))
  const courses = catalog.data?.pages.flatMap((p) => p.data) ?? []
  const total = Number(catalog.data?.pages[0]?.meta?.total ?? 0)
  // Deux colonnes : 20 de marge de chaque côté, 12 entre les cartes.
  const { width } = useWindowDimensions()
  const cardWidth = Math.floor((width - 40 - GAP) / 2)

  return (
    <SafeAreaView edges={['top']} style={styles.fill}>
      <View style={styles.head}>
        <Text variant="title">Explorer</Text>
        <View style={styles.search}>
          <Search size={20} color={colors.ink3} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Une compétence, un formateur…"
            placeholderTextColor={colors.hairline}
            style={styles.input}
            returnKeyType="search"
            autoCorrect={false}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Effacer la recherche">
              <X size={18} color={colors.ink3} />
            </Pressable>
          ) : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {[['', 'Tout'] as const, ...FORMATS].map(([value, label]) => {
            const active = (format ?? '') === value
            return (
              <Pressable
                key={value || 'all'}
                onPress={() => setFormat(value || null)}
                style={[styles.filter, active && styles.filterActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text variant="label" style={{ color: active ? '#fff' : colors.ink2, fontSize: 13 }}>{label}</Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      {catalog.isLoading ? (
        <View style={[styles.list, styles.grid]}><Repeat count={4}><CourseCardSkeleton width={cardWidth} /></Repeat></View>
      ) : catalog.isError ? (
        <ErrorState message={(catalog.error as Error).message} onRetry={() => catalog.refetch()} />
      ) : (
        <FlatList
          data={courses}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={total ? <Text variant="caption">{total} ressource{total > 1 ? 's' : ''}</Text> : undefined}
          numColumns={2}
          columnWrapperStyle={{ gap: GAP }}
          ItemSeparatorComponent={() => <View style={{ height: GAP }} />}
          renderItem={({ item }) => <CourseCard course={item} owned={owned.has(item.id)} width={cardWidth} />}
          onEndReached={() => { if (catalog.hasNextPage && !catalog.isFetchingNextPage) void catalog.fetchNextPage() }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={catalog.isFetchingNextPage ? <ActivityIndicator color={colors.brand} style={{ margin: 16 }} /> : undefined}
          // Comme la recherche d'iOS : la loupe, le mot cherché, et le conseil
          // qui correspond à ce qui a été tapé ou filtré.
          ListEmptyComponent={catalog.fetchStatus === 'paused' ? (
            // Requête en attente du réseau : ce n'est pas « aucun résultat ».
            <EmptyState
              icon={<WifiOff color={colors.ink3} size={40} strokeWidth={1.5} />}
              title="Recherche indisponible hors ligne"
              body="Elle reprendra d’elle-même dès que le réseau revient."
            />
          ) : (
            <EmptyState
              icon={<Search color={colors.ink3} size={40} strokeWidth={1.5} />}
              title={query.trim() ? `Aucun résultat pour « ${query.trim()} »` : 'Aucune ressource'}
              body={format ? 'Retire le filtre ou essaie un autre mot.' : 'Vérifie l’orthographe ou essaie un autre mot.'}
            />
          )}
          refreshing={catalog.isRefetching && !catalog.isFetchingNextPage}
          onRefresh={() => catalog.refetch()}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
  head: { paddingHorizontal: 20, paddingTop: 20, gap: 14 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.paper,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    minHeight: 44,
  },
  input: { flex: 1, fontFamily: fonts.body, fontSize: 16, color: colors.ink, paddingVertical: 10 },
  filters: { gap: 8, paddingBottom: 6 },
  filter: { paddingHorizontal: 13, height: 32, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line },
  filterActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  list: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40, gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
})
