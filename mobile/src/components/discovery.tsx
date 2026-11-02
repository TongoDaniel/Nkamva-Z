import { memo, useEffect, useState, type ReactElement } from 'react'
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Check, ChevronDown, ChevronRight, Lock, Search, Users, WifiOff } from 'lucide-react-native'
import { useCommunities, useTrainers } from '../lib/queries'
import type { CatalogSort, CommunityListItem, PublicTrainer } from '../lib/types'
import { Text } from '../ui/Text'
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
export function FilterPill({ label, active, onPress, icon, menu }: { label: string; active?: boolean; onPress: () => void; icon?: ReactElement; menu?: boolean }) {
  const fg = active ? '#fff' : colors.ink2
  return (
    <Pressable
      onPress={onPress}
      style={[styles.pill, active && styles.pillActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
    >
      {icon}
      {/* Jamais rétrécie : dans une rangée défilante, iOS coupait le libellé. */}
      <Text variant="label" style={{ color: fg, fontSize: 13, lineHeight: 17, flexShrink: 0 }}>{label}</Text>
      {menu ? <ChevronDown size={15} color={fg} /> : null}
    </Pressable>
  )
}

export const SORT_LABELS: Record<CatalogSort, string> = { newest: 'Nouveautés', popular: 'Les plus suivies' }

export interface MenuOption {
  value: string
  label: string
  count?: number
}

/**
 * Menu d'un seul critère, ouvert depuis sa pastille : comme les filtres de
 * Vinted ou de Google Shopping, chaque critère a sa pastille et son menu, rien
 * n'est proposé à deux endroits. Un choix s'applique aussitôt et referme le
 * menu ; toucher le choix déjà pris le retire.
 */
export function FacetMenu({ title, options, value, onSelect, onClose, allLabel }: {
  title: string | null
  options: MenuOption[]
  value: string | null
  onSelect: (value: string | null) => void
  onClose: () => void
  /** Ligne « tout » en tête (« Tous les thèmes »), absente pour le tri. */
  allLabel?: string
}) {
  const choose = (v: string | null) => { onSelect(v); onClose() }
  return (
    <Modal visible={title !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer" />
      <SafeAreaView edges={['bottom']} style={styles.menu}>
        <View style={styles.grabber} />
        <Text variant="heading" style={styles.menuTitle}>{title}</Text>
        <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingBottom: 8 }}>
          {allLabel ? <Option label={allLabel} selected={value === null} onPress={() => choose(null)} /> : null}
          {options.map((o, i) => (
            <View key={o.value}>
              {i > 0 || allLabel ? <Divider inset={20} /> : null}
              <Option label={o.label} count={o.count} selected={value === o.value} onPress={() => choose(value === o.value && allLabel ? null : o.value)} />
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
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
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 20, 30, 0.35)' },
  menu: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: colors.line, marginBottom: 10 },
  menuTitle: { paddingHorizontal: 20, paddingBottom: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, minHeight: 52 },
  check: { width: 22, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40, flexGrow: 1 },
})
