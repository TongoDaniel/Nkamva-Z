import { useState } from 'react'
import { FlatList, Pressable, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Plus, SquareStack } from 'lucide-react-native'
import { useTrainerCourses, useTrainerOverview, type TrainerCourse } from '../../lib/studio'
import { formatFcfa, formatLabel } from '../../lib/format'
import { Text } from '../../ui/Text'
import { Button } from '../../ui/Button'
import { Divider } from '../../ui/Bits'
import { Cover } from '../../ui/Cover'
import { EmptyState, ErrorState } from '../../ui/States'
import { Repeat, ResourceRowSkeleton } from '../../ui/Skeleton'
import { colors, radius } from '../../ui/theme'
import { openTrainerPage } from '../../components/studio'

type Filter = 'all' | TrainerCourse['status']

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'Toutes' },
  { key: 'published', label: 'Publiées' },
  { key: 'draft', label: 'Brouillons' },
  { key: 'archived', label: 'Archivées' },
]

export const STATUS_LABEL: Record<TrainerCourse['status'], string> = {
  published: 'Publiée',
  draft: 'Brouillon',
  archived: 'Archivée',
}

/**
 * Les ressources du formateur, comme l'onglet Contenu de YouTube Studio :
 * vignette, statut et ventes de chacune. Créer une ressource (texte long,
 * fichiers lourds) reste sur le site.
 */
export default function Contenus() {
  const courses = useTrainerCourses()
  const panel = useTrainerOverview()
  const [filter, setFilter] = useState<Filter>('all')
  const sales = new Map(panel.data?.salesByCourse.map((s) => [s.courseId, s]))
  const items = (courses.data ?? []).filter((c) => filter === 'all' || c.status === filter)

  return (
    <SafeAreaView edges={['top']} style={styles.fill}>
      <View style={styles.head}>
        <View style={styles.titleRow}>
          <Text variant="title" style={{ flex: 1 }}>Ressources</Text>
          <Pressable
            onPress={() => openTrainerPage('/formateur/ressources/nouvelle')}
            style={styles.add}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Nouvelle ressource"
          >
            <Plus size={22} color={colors.ink} />
          </Pressable>
        </View>
        <View style={styles.segment}>
          {FILTERS.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.segmentItem, filter === f.key && styles.segmentActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === f.key }}
            >
              <Text variant="label" numberOfLines={1} style={{ fontSize: 13, color: filter === f.key ? colors.ink : colors.ink3 }}>{f.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {courses.isLoading ? (
        <View style={styles.list}><Repeat count={5}><ResourceRowSkeleton /></Repeat></View>
      ) : courses.isError ? (
        <ErrorState message={(courses.error as Error).message} onRetry={() => courses.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          refreshing={courses.isRefetching}
          onRefresh={() => { void courses.refetch(); void panel.refetch() }}
          ItemSeparatorComponent={() => <Divider inset={78} />}
          renderItem={({ item }) => {
            const s = sales.get(item.id)
            return (
              <Pressable
                onPress={() => router.push({ pathname: '/studio/ressource/[id]', params: { id: item.id } })}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
                accessibilityRole="button"
              >
                <Cover course={item} height={64} style={{ width: 64 }} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text variant="bodyStrong" numberOfLines={2}>{item.title}</Text>
                  <Text variant="small" numberOfLines={1}>
                    {formatLabel(item.format)} · <Text variant="small" style={item.status === 'draft' ? { color: colors.goldInk } : undefined}>{STATUS_LABEL[item.status]}</Text>
                  </Text>
                  <Text variant="caption">
                    {s ? `${s.salesCount} vente${s.salesCount > 1 ? 's' : ''} · ${formatFcfa(s.netRevenueFcfa)}` : 'Aucune vente'}
                  </Text>
                </View>
              </Pressable>
            )
          }}
          ListEmptyComponent={
            filter === 'all' ? (
              <EmptyState
                icon={<SquareStack color={colors.ink3} size={40} strokeWidth={1.5} />}
                title="Aucune ressource"
                body="Crée ta première ressource depuis le site : tu la retrouveras ici pour la publier et suivre ses ventes."
                action={<Button label="Créer sur le site" tone="secondary" onPress={() => openTrainerPage('/formateur/ressources/nouvelle')} />}
              />
            ) : (
              <EmptyState title={`Aucune ressource ${FILTERS.find((f) => f.key === filter)!.label.toLowerCase().replace(/s$/, '')}`} />
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
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  add: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  segment: { flexDirection: 'row', backgroundColor: colors.line2, borderRadius: radius.sm, padding: 3 },
  segmentItem: { flex: 1, minHeight: 34, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm - 2, paddingHorizontal: 2 },
  segmentActive: { backgroundColor: colors.card, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
  list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
  row: { flexDirection: 'row', gap: 14, alignItems: 'center', paddingVertical: 10 },
})
