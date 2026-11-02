import { memo, useEffect, useState, type ReactElement } from 'react'
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Check, ChevronRight, Lock, Search, Users, WifiOff, X } from 'lucide-react-native'
import { NO_FILTERS, useCatalogCount, useCatalogFacets, useCommunities, useTrainers } from '../lib/queries'
import { formatLabel } from '../lib/format'
import type { CatalogFilters, CatalogSort, CommunityListItem, PublicTrainer } from '../lib/types'
import { Text } from '../ui/Text'
import { Button } from '../ui/Button'
import { Avatar, CommunityAvatar, Divider } from '../ui/Bits'
import { EmptyState, ErrorState } from '../ui/States'
import { Bone, Repeat } from '../ui/Skeleton'
import { colors, radius } from '../ui/theme'

export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

/**
 * Sélecteur de volet, comme le `UISegmentedControl` d'iOS ou les onglets de
 * recherche de l'App Store : un fond gris, le choix posé sur une pastille
 * blanche.
 */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.segment, active && styles.segmentActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text variant="label" numberOfLines={1} style={{ fontSize: 13, color: active ? colors.ink : colors.ink2 }}>{o.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/** Pastille de filtre : contour au repos, encre pleine une fois choisie. */
export function FilterPill({ label, active, onPress, icon }: { label: string; active?: boolean; onPress: () => void; icon?: ReactElement }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.pill, active && styles.pillActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
    >
      {icon}
      {/* Jamais rétrécie : dans une rangée, iOS coupait le libellé. */}
      <Text variant="label" style={{ color: active ? '#fff' : colors.ink2, fontSize: 13, lineHeight: 17, flexShrink: 0 }}>{label}</Text>
    </Pressable>
  )
}

export const SORT_LABELS: Record<CatalogSort, string> = { newest: 'Nouveautés', popular: 'Les plus suivies' }

/**
 * Tous les filtres derrière un seul bouton, sur le modèle d'Airbnb : la feuille
 * réunit le tri, le thème, le format et le niveau, avec le nombre de
 * ressources derrière chaque choix. Les choix ne s'appliquent qu'à la
 * validation, et le bouton du bas dit combien de ressources les attendent ;
 * « Tout effacer » remet à zéro d'un geste. Rien n'est proposé ailleurs.
 */
export function FilterSheet({ visible, filters, onClose, onApply }: {
  visible: boolean
  filters: CatalogFilters
  onClose: () => void
  onApply: (f: CatalogFilters) => void
}) {
  const [draft, setDraft] = useState(filters)
  useEffect(() => { if (visible) setDraft(filters) }, [visible, filters])
  const facets = useCatalogFacets()
  const count = useCatalogCount(draft, visible)
  const set = (patch: Partial<CatalogFilters>) => setDraft((d) => ({ ...d, ...patch }))
  const toggle = (key: 'category' | 'format' | 'level', value: string) => set({ [key]: draft[key] === value ? null : value })
  const total = count.data
  const label = total === undefined ? 'Afficher les ressources' : total === 0 ? 'Aucune ressource' : `Afficher ${total} ressource${total > 1 ? 's' : ''}`
  const f = facets.data

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.sheet}>
        <View style={styles.sheetHead}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fermer">
            <X size={22} color={colors.ink} />
          </Pressable>
          <Text variant="heading">Filtres</Text>
          <Pressable onPress={() => setDraft({ ...NO_FILTERS, search: draft.search })} hitSlop={12} accessibilityRole="button">
            <Text variant="label" style={{ color: colors.brand }}>Tout effacer</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.sheetBody}>
          <Group title="Trier par">
            {(Object.keys(SORT_LABELS) as CatalogSort[]).map((v) => (
              <Option key={v} label={SORT_LABELS[v]} selected={draft.sort === v} onPress={() => set({ sort: v })} />
            ))}
          </Group>
          {facets.isLoading ? (
            <Repeat count={3}><Bone height={140} style={{ borderRadius: 14, marginBottom: 20 }} /></Repeat>
          ) : f ? (
            <>
              {f.categories.length > 1 || draft.category ? (
                <Group title="Thème">
                  {f.categories.map((o) => <Option key={o.value} label={o.value} count={o.count} selected={draft.category === o.value} onPress={() => toggle('category', o.value)} />)}
                </Group>
              ) : null}
              {f.formats.length > 1 || draft.format ? (
                <Group title="Format">
                  {f.formats.map((o) => <Option key={o.value} label={formatLabel(o.value)} count={o.count} selected={draft.format === o.value} onPress={() => toggle('format', o.value)} />)}
                </Group>
              ) : null}
              {f.levels.length > 1 || draft.level ? (
                <Group title="Niveau">
                  {f.levels.map((o) => <Option key={o.value} label={capitalize(o.value)} count={o.count} selected={draft.level === o.value} onPress={() => toggle('level', o.value)} />)}
                </Group>
              ) : null}
            </>
          ) : (
            <Text variant="small">Les filtres reviendront avec le réseau.</Text>
          )}
        </ScrollView>

        <View style={styles.sheetFoot}>
          <Button label={label} disabled={total === 0} loading={count.isFetching && total === undefined} onPress={() => { onApply(draft); onClose() }} />
        </View>
      </SafeAreaView>
    </Modal>
  )
}

function Group({ title, children }: { title: string; children: ReactElement[] }) {
  return (
    <View style={{ gap: 6 }}>
      <Text variant="caption" style={styles.groupTitle}>{title}</Text>
      <View style={styles.group}>
        {children.map((child, i) => (
          <View key={i}>
            {i > 0 ? <Divider inset={20} /> : null}
            {child}
          </View>
        ))}
      </View>
    </View>
  )
}

function Option({ label, count, selected, onPress }: { label: string; count?: number; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.paper }]}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
    >
      <Text variant={selected ? 'bodyStrong' : 'body'} style={{ flex: 1, color: colors.ink }}>{label}</Text>
      {count !== undefined ? <Text variant="small" style={{ color: colors.ink3 }}>{count}</Text> : null}
      <View style={styles.check}>{selected ? <Check size={20} color={colors.brand} strokeWidth={2.5} /> : null}</View>
    </Pressable>
  )
}

export function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

function members(n: number) {
  return `${n} membre${n > 1 ? 's' : ''}`
}

/** Une communauté de l'annuaire : son icône, son animateur avec sa photo, ses membres. */
export const CommunityRow = memo(function CommunityRow({ c }: { c: CommunityListItem }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/communaute/[slug]', params: { slug: c.slug } })}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
      accessibilityRole="button"
      accessibilityLabel={`${c.name}, animée par ${c.trainerName}, ${members(c.membersCount)}`}
    >
      <CommunityAvatar name={c.name} size={52} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={styles.inline}>
          <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>{c.name}</Text>
          {c.visibility === 'PRIVATE' ? <Lock size={13} color={colors.ink3} /> : null}
        </View>
        <View style={styles.inline}>
          <Avatar name={c.trainerName} uri={c.trainerAvatarUrl} size={18} />
          <Text variant="caption" numberOfLines={1} style={{ flexShrink: 1 }}>{c.trainerName}</Text>
        </View>
        <View style={styles.inline}>
          <Users size={13} color={colors.ink3} />
          <Text variant="caption">{members(c.membersCount)}</Text>
        </View>
      </View>
      <ChevronRight size={18} color={colors.hairline} />
    </Pressable>
  )
})

export const TrainerRow = memo(function TrainerRow({ t }: { t: PublicTrainer }) {
  const facts = [
    t.publishedCount ? `${t.publishedCount} ressource${t.publishedCount > 1 ? 's' : ''}` : null,
    t.communityCount ? 'anime une communauté' : null,
    t.learners ? `${t.learners} apprenant${t.learners > 1 ? 's' : ''}` : null,
  ].filter(Boolean).join(' · ')
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/formateur/[id]', params: { id: t.id } })}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
      accessibilityRole="button"
    >
      <Avatar name={t.fullName} uri={t.avatarUrl} size={52} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={1}>{t.fullName ?? 'Formateur NKAMVA'}</Text>
        {t.slogan ? <Text variant="small" numberOfLines={1}>{t.slogan}</Text> : null}
        {facts ? <Text variant="caption" numberOfLines={1}>{facts}</Text> : null}
      </View>
      <ChevronRight size={18} color={colors.hairline} />
    </Pressable>
  )
})

const Separator = () => <Divider inset={86} />

function offlineOr(paused: boolean, query: string, what: string) {
  return paused ? (
    <EmptyState icon={<WifiOff color={colors.ink3} size={40} strokeWidth={1.5} />} title="Indisponible hors ligne" body="La liste reviendra d’elle-même avec le réseau." />
  ) : (
    <EmptyState
      icon={<Search color={colors.ink3} size={40} strokeWidth={1.5} />}
      title={query ? `Aucun résultat pour « ${query} »` : `Aucun${what === 'communauté' ? 'e' : ''} ${what} pour l’instant`}
      body={query ? 'Vérifie l’orthographe ou essaie un autre mot.' : undefined}
    />
  )
}

/** L'annuaire des communautés, page par page. */
export function CommunityDirectory({ search, header }: { search: string; header?: ReactElement }) {
  const list = useCommunities(search)
  const items = list.data?.pages.flatMap((p) => p.data) ?? []
  if (list.isError && !items.length) return <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} />
  return (
    <FlatList
      data={items}
      keyExtractor={(c) => c.id}
      renderItem={({ item }) => <CommunityRow c={item} />}
      ItemSeparatorComponent={Separator}
      ListHeaderComponent={header}
      contentContainerStyle={styles.list}
      style={list.isPlaceholderData ? { opacity: 0.6 } : undefined}
      keyboardDismissMode="on-drag"
      onEndReached={() => { if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage() }}
      onEndReachedThreshold={0.5}
      ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={colors.brand} style={{ margin: 16 }} /> : undefined}
      ListEmptyComponent={list.isLoading ? <Repeat count={5}><Bone height={60} style={{ marginBottom: 18 }} /></Repeat> : offlineOr(list.fetchStatus === 'paused', search, 'communauté')}
      refreshing={list.isRefetching && !list.isFetchingNextPage}
      onRefresh={() => list.refetch()}
    />
  )
}

/** L'annuaire des formateurs. */
export function TrainerDirectory({ search }: { search: string }) {
  const list = useTrainers(search)
  const items = list.data ?? []
  if (list.isError && !items.length) return <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} />
  return (
    <FlatList
      data={items}
      keyExtractor={(t) => t.id}
      renderItem={({ item }) => <TrainerRow t={item} />}
      ItemSeparatorComponent={Separator}
      contentContainerStyle={styles.list}
      style={list.isPlaceholderData ? { opacity: 0.6 } : undefined}
      keyboardDismissMode="on-drag"
      ListEmptyComponent={list.isLoading ? <Repeat count={5}><Bone height={60} style={{ marginBottom: 18 }} /></Repeat> : offlineOr(list.fetchStatus === 'paused', search, 'formateur')}
      refreshing={list.isRefetching}
      onRefresh={() => list.refetch()}
    />
  )
}

const styles = StyleSheet.create({
  segmented: { flexDirection: 'row', backgroundColor: colors.paper, borderRadius: 10, padding: 2 },
  segment: { flex: 1, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  segmentActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, minHeight: 36, flexShrink: 0, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line },
  pillActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  sheet: { flex: 1, backgroundColor: colors.background },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line2 },
  sheetBody: { padding: 20, gap: 24, paddingBottom: 32 },
  sheetFoot: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, borderTopWidth: 1, borderTopColor: colors.line2 },
  groupTitle: { textTransform: 'uppercase', letterSpacing: 0.6, marginLeft: 4 },
  group: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, overflow: 'hidden', backgroundColor: '#fff' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, minHeight: 52 },
  check: { width: 22, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40, flexGrow: 1 },
})
