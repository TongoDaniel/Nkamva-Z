import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native'
import { Receipt } from 'lucide-react-native'
import { useSales, type SalesSummary } from '../../lib/studio'
import { formatFcfa } from '../../lib/format'
import { Text } from '../../ui/Text'
import { Divider } from '../../ui/Bits'
import { EmptyState, ErrorState } from '../../ui/States'
import { Bone, Repeat } from '../../ui/Skeleton'
import { colors } from '../../ui/theme'
import { SaleRow } from '../../components/studio'

function Summary({ s }: { s: SalesSummary }) {
  return (
    <View style={{ gap: 10, marginBottom: 8 }}>
      <View style={styles.facts}>
        {[
          { k: 'Encaissé', v: formatFcfa(s.grossFcfa) },
          { k: 'Commission', v: formatFcfa(s.commissionFcfa) },
          { k: 'Pour toi', v: formatFcfa(s.netFcfa) },
        ].map((f, i) => (
          <View key={f.k} style={[styles.fact, i > 0 && styles.factSep]}>
            <Text variant="caption" numberOfLines={1}>{f.k}</Text>
            <Text variant="label" numberOfLines={1} style={{ fontSize: 14 }}>{f.v}</Text>
          </View>
        ))}
      </View>
      <Text variant="caption">
        {s.count} vente{s.count > 1 ? 's' : ''} encaissée{s.count > 1 ? 's' : ''}
        {s.refundedCount ? ` · ${s.refundedCount} remboursée${s.refundedCount > 1 ? 's' : ''} (${formatFcfa(s.refundedFcfa)}), comptée${s.refundedCount > 1 ? 's' : ''} à part` : ''}
      </Text>
    </View>
  )
}

/**
 * Historique des ventes, à la manière de la liste des commandes de Shopify.
 * Les montants affichés sont la part du formateur ; une vente remboursée ou
 * échouée reste visible, barrée, pour que le total s'explique.
 */
export default function Ventes() {
  const sales = useSales()
  const rows = sales.data?.pages.flatMap((p) => p.data) ?? []
  const summary = sales.data?.pages[0]?.meta?.summary as SalesSummary | undefined

  if (sales.isLoading) {
    return (
      <View style={styles.page}>
        <Bone height={54} style={{ marginBottom: 16 }} />
        <Repeat count={6}><Bone height={44} style={{ marginBottom: 14 }} /></Repeat>
      </View>
    )
  }
  if (sales.isError) return <ErrorState message={(sales.error as Error).message} onRetry={() => sales.refetch()} />

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.page}
      data={rows}
      keyExtractor={(s) => s.id}
      ListHeaderComponent={summary && rows.length ? <Summary s={summary} /> : undefined}
      renderItem={({ item }) => <SaleRow sale={item} />}
      ItemSeparatorComponent={() => <Divider />}
      onEndReached={() => { if (sales.hasNextPage && !sales.isFetchingNextPage) void sales.fetchNextPage() }}
      onEndReachedThreshold={0.4}
      ListFooterComponent={sales.isFetchingNextPage ? <ActivityIndicator color={colors.brand} style={{ margin: 16 }} /> : undefined}
      refreshing={sales.isRefetching && !sales.isFetchingNextPage}
      onRefresh={() => sales.refetch()}
      ListEmptyComponent={
        <EmptyState
          icon={<Receipt color={colors.ink3} size={40} strokeWidth={1.5} />}
          title="Pas encore de vente"
          body="Chaque achat d’une de tes ressources ou adhésion à ta communauté s’affichera ici."
        />
      }
    />
  )
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 40 },
  facts: { flexDirection: 'row', paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  fact: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  factSep: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.line },
})
