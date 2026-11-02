import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { useAuth } from '../../lib/auth'
import { Search, WifiOff, X } from 'lucide-react-native'
import { activeFilterCount, NO_FILTERS, useCatalog, useCatalogFacets, useResources } from '../../lib/queries'
import { formatLabel } from '../../lib/format'
import type { CatalogFilters, CatalogSort, CourseListItem } from '../../lib/types'
import { Text } from '../../ui/Text'
import { Button } from '../../ui/Button'
import { EmptyState, ErrorState } from '../../ui/States'
import { CourseCardSkeleton, Repeat } from '../../ui/Skeleton'
import { colors, fonts, radius } from '../../ui/theme'
import { CourseCard } from '../../components/cards'
import { capitalize, CommunityDirectory, FacetMenu, FilterPill, Segmented, SORT_LABELS, TrainerDirectory, useDebounced, type MenuOption } from '../../components/discovery'

const GAP = 12

type Criterion = 'sort' | 'category' | 'format' | 'level'

const MENU_TITLES: Record<Criterion, string> = { sort: 'Trier par', category: 'Thème', format: 'Format', level: 'Niveau' }

type View_ = 'ressources' | 'communautes' | 'formateurs'

const VIEWS: { value: View_; label: string }[] = [
  { value: 'ressources', label: 'Ressources' },
  { value: 'communautes', label: 'Communautés' },
  { value: 'formateurs', label: 'Formateurs' },
]

const PLACEHOLDERS: Record<View_, string> = {
  ressources: 'Une compétence, un formateur…',
  communautes: 'Une communauté, un animateur…',
  formateurs: 'Un nom, un domaine…',
}

/**
 * Explorer : tout ce que NKAMVA propose, en volets, comme la recherche de
 * l'App Store (apps, jeux, articles) ou d'Airbnb : trois pour un membre, deux
 * pour un visiteur. Une seule barre de recherche sert tous les volets. On y arrive aussi d'un thème de l'accueil
 * (`/explorer?theme=Data`) ou du lien « Toutes les communautés »
 * (`/explorer?vue=communautes`).
 */
export default function Explorer() {
  const params = useLocalSearchParams<{ theme?: string; vue?: View_ }>()
  // Un visiteur a un onglet Communautés : le volet ferait doublon.
  const guest = useAuth().status !== 'signedIn'
  const views = guest ? VIEWS.filter((v) => v.value !== 'communautes') : VIEWS
  const [chosen, setView] = useState<View_>(params.vue ?? 'ressources')
  const view: View_ = guest && chosen === 'communautes' ? 'ressources' : chosen
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<CatalogFilters>(NO_FILTERS)
  const search = useDebounced(query.trim())

  // Un lien entrant (thème, volet) s'applique même si l'onglet était déjà
  // ouvert sur autre chose.
  useEffect(() => {
    if (params.theme) {
      setView('ressources')
      setFilters({ ...NO_FILTERS, category: params.theme })
    }
  }, [params.theme])
  useEffect(() => {
    if (guest && params.vue === 'communautes') router.navigate('/communautes')
    else if (params.vue) setView(params.vue)
  }, [params.vue, guest])

  return (
    <SafeAreaView edges={['top']} style={styles.fill}>
      <View style={styles.head}>
        <Text variant="title">Explorer</Text>
        <View style={styles.search}>
          <Search size={20} color={colors.ink3} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={PLACEHOLDERS[view]}
            placeholderTextColor={colors.hairline}
            style={styles.input}
            returnKeyType="search"
            autoCorrect={false}
            clearButtonMode="never"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Effacer la recherche">
              <X size={18} color={colors.ink3} />
            </Pressable>
          ) : null}
        </View>
        <Segmented value={view} options={views} onChange={setView} />
      </View>

      {view === 'ressources' ? (
        <Resources search={search} filters={filters} setFilters={setFilters} />
      ) : view === 'communautes' ? (
        <CommunityDirectory search={search} header={
          search ? undefined : <Text variant="small" style={styles.intro}>Des groupes animés par un formateur : entraide, lives réguliers et ressources incluses.</Text>
        } />
      ) : (
        <TrainerDirectory search={search} />
      )}
    </SafeAreaView>
  )
}

function Resources({ search, filters, setFilters }: { search: string; filters: CatalogFilters; setFilters: (f: CatalogFilters) => void }) {
  const [menu, setMenu] = useState<Criterion | null>(null)
  const applied = useMemo(() => ({ ...filters, search }), [filters, search])
  const catalog = useCatalog(applied)
  const facets = useCatalogFacets()
  const resources = useResources()
  const owned = useMemo(() => new Set(resources.data?.map((r) => r.courseId)), [resources.data])
  const courses = useMemo(() => catalog.data?.pages.flatMap((p) => p.data) ?? [], [catalog.data])
  const meta = catalog.data?.pages[0]?.meta
  const total = Number(meta?.total ?? 0)
  const count = activeFilterCount(filters)
  // Deux colonnes : 20 de marge de chaque côté, 12 entre les cartes.
  const { width } = useWindowDimensions()
  const cardWidth = Math.floor((width - 40 - GAP) / 2)
  const renderItem = useCallback(
    ({ item }: { item: CourseListItem }) => <CourseCard course={item} owned={owned.has(item.id)} width={cardWidth} />,
    [owned, cardWidth],
  )

  // Une pastille par critère, chacune avec son menu : rien n'apparaît à
  // deux endroits. Une pastille choisie affiche sa valeur et passe en encre.
  const f = facets.data
  const options: Record<Criterion, MenuOption[]> = {
    sort: (Object.keys(SORT_LABELS) as CatalogSort[]).map((v) => ({ value: v, label: SORT_LABELS[v] })),
    category: (f?.categories ?? []).map((o) => ({ value: o.value, label: o.value, count: o.count })),
    format: (f?.formats ?? []).map((o) => ({ value: o.value, label: formatLabel(o.value), count: o.count })),
    level: (f?.levels ?? []).map((o) => ({ value: o.value, label: capitalize(o.value), count: o.count })),
  }
  const pills: { key: Criterion; label: string; active: boolean }[] = [
    { key: 'sort', label: SORT_LABELS[filters.sort], active: filters.sort !== 'newest' },
    { key: 'category', label: filters.category ?? 'Thème', active: !!filters.category },
    { key: 'format', label: filters.format ? formatLabel(filters.format) : 'Format', active: !!filters.format },
    { key: 'level', label: filters.level ? capitalize(filters.level) : 'Niveau', active: !!filters.level },
  ]
  // Un critère sans choix réel (un seul format au catalogue) n'a pas de pastille.
  const shown = pills.filter((p) => p.active || p.key === 'sort' || options[p.key].length > 1)
  const select = (key: Criterion, value: string | null) =>
    setFilters(key === 'sort' ? { ...filters, sort: (value ?? 'newest') as CatalogSort } : { ...filters, [key]: value })

  // Le tri se lit déjà sur sa pastille : le compteur ne le répète pas.
  const summary = `${total} ressource${total > 1 ? 's' : ''}`

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} style={styles.filterBar}>
        {shown.map((p) => <FilterPill key={p.key} label={p.label} active={p.active} menu onPress={() => setMenu(p.key)} />)}
        {count ? (
          <Pressable onPress={() => setFilters(NO_FILTERS)} hitSlop={8} style={styles.clear} accessibilityRole="button">
            <Text variant="label" style={{ color: colors.brand, fontSize: 13 }}>Effacer</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {catalog.isLoading ? (
        <View style={[styles.list, styles.grid]}><Repeat count={4}><CourseCardSkeleton width={cardWidth} /></Repeat></View>
      ) : catalog.isError && !courses.length ? (
        <ErrorState message={(catalog.error as Error).message} onRetry={() => catalog.refetch()} />
      ) : (
        <FlatList
          data={courses}
          keyExtractor={(c) => c.id}
          // Pendant qu'une nouvelle combinaison charge, l'ancienne liste reste
          // visible, estompée, plutôt qu'un squelette à chaque choix.
          style={catalog.isPlaceholderData ? { opacity: 0.55 } : undefined}
          contentContainerStyle={styles.list}
          keyboardDismissMode="on-drag"
          ListHeaderComponent={total ? (
            <View style={{ gap: 2, marginBottom: 4 }}>
              <Text variant="caption">{summary}</Text>
              {filters.sort === 'popular' && meta?.ranked === false ? (
                <Text variant="caption">Pas encore assez d’activité pour classer : les nouveautés d’abord.</Text>
              ) : null}
            </View>
          ) : undefined}
          numColumns={2}
          columnWrapperStyle={{ gap: GAP }}
          ItemSeparatorComponent={() => <View style={{ height: GAP }} />}
          renderItem={renderItem}
          initialNumToRender={6}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
          onEndReached={() => { if (catalog.hasNextPage && !catalog.isFetchingNextPage) void catalog.fetchNextPage() }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={catalog.isFetchingNextPage ? <ActivityIndicator color={colors.brand} style={{ margin: 16 }} /> : undefined}
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
              title={search ? `Aucun résultat pour « ${search} »` : 'Aucune ressource'}
              body={count ? 'Aucune ressource ne réunit tous ces filtres.' : 'Vérifie l’orthographe ou essaie un autre mot.'}
              action={count ? <Button label="Effacer les filtres" tone="secondary" onPress={() => setFilters(NO_FILTERS)} /> : undefined}
            />
          )}
          refreshing={catalog.isRefetching && !catalog.isFetchingNextPage && !catalog.isPlaceholderData}
          onRefresh={() => { void catalog.refetch(); void facets.refetch() }}
        />
      )}

      <FacetMenu
        title={menu ? MENU_TITLES[menu] : null}
        options={menu ? options[menu] : []}
        value={menu ? (menu === 'sort' ? filters.sort : filters[menu]) : null}
        allLabel={menu === 'category' ? 'Tous les thèmes' : menu === 'format' ? 'Tous les formats' : menu === 'level' ? 'Tous les niveaux' : undefined}
        onSelect={(v) => { if (menu) select(menu, v) }}
        onClose={() => setMenu(null)}
      />
    </>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
  head: { paddingHorizontal: 20, paddingTop: 20, gap: 12 },
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
  filterBar: { flexGrow: 0, flexShrink: 0, marginTop: 12 },
  filters: { gap: 8, paddingHorizontal: 20, paddingVertical: 2, alignItems: 'center' },
  clear: { paddingHorizontal: 6, justifyContent: 'center', minHeight: 36 },
  intro: { marginBottom: 6 },
  list: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40, gap: 8, flexGrow: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
})
