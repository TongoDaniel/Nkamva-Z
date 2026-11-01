import { FlatList, Pressable, StyleSheet, View } from 'react-native'
import { ChevronRight, Gavel } from 'lucide-react-native'
import { formatDate, formatFcfa } from '../../lib/format'
import { useTrainerDisputes, type TrainerDispute } from '../../lib/studio'
import { Text } from '../../ui/Text'
import { Divider } from '../../ui/Bits'
import { EmptyState, ErrorState } from '../../ui/States'
import { Bone, Repeat } from '../../ui/Skeleton'
import { colors } from '../../ui/theme'
import { openTrainerPage } from '../../components/studio'

const STATUS: Record<TrainerDispute['status'], string> = {
  OPEN: 'Ouvert',
  IN_REVIEW: 'En examen par l’équipe',
  WAITING_LEARNER: 'En attente de l’acheteur',
  RESOLVED_REFUNDED: 'Clos · remboursé',
  RESOLVED_REJECTED: 'Clos · rejeté',
  RESOLVED_AUTO: 'Clos',
}

/**
 * Les litiges ouverts sur les ventes du formateur. Aucune échéance ne pèse
 * sur lui (`countDisputesToContest`) : on signale seulement ceux où il n'a
 * pas encore donné sa version. Répondre, pièces à l'appui, se fait sur le
 * site.
 */
export default function Litiges() {
  const disputes = useTrainerDisputes()

  if (disputes.isLoading) {
    return <View style={styles.page}><Repeat count={3}><Bone height={52} style={{ marginBottom: 16 }} /></Repeat></View>
  }
  if (disputes.isError) return <ErrorState message={(disputes.error as Error).message} onRetry={() => disputes.refetch()} />

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.page}
      data={disputes.data ?? []}
      keyExtractor={(d) => d.id}
      refreshing={disputes.isRefetching}
      onRefresh={() => disputes.refetch()}
      ItemSeparatorComponent={() => <Divider />}
      renderItem={({ item }) => {
        const open = item.status === 'OPEN' || item.status === 'IN_REVIEW'
        const unanswered = open && item.supportTickets.length === 0
        const subject = item.purchase.course?.title ?? item.purchase.community?.name ?? 'Achat'
        return (
          <Pressable
            onPress={() => openTrainerPage(`/formateur/litiges/${item.id}`)}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
            accessibilityRole="button"
          >
            <View style={{ flex: 1, gap: 3 }}>
              <Text variant="bodyStrong" numberOfLines={1}>{subject}</Text>
              <Text variant="caption">Ouvert le {formatDate(item.openedAt)} · {formatFcfa(item.disputedAmountFcfa)}</Text>
              <Text variant="caption" style={{ color: unanswered ? colors.goldInk : colors.ink3 }}>
                {unanswered ? 'Ta version n’a pas encore été donnée' : STATUS[item.status]}
              </Text>
            </View>
            <ChevronRight size={18} color={colors.hairline} />
          </Pressable>
        )
      }}
      ListFooterComponent={disputes.data?.length ? (
        <Text variant="caption" style={{ marginTop: 16 }}>Pour répondre à un litige et joindre des pièces, ouvre-le : il s’affiche sur le site.</Text>
      ) : undefined}
      ListEmptyComponent={
        <EmptyState icon={<Gavel color={colors.ink3} size={40} strokeWidth={1.5} />} title="Aucun litige" body="Si un acheteur conteste une vente, le dossier apparaîtra ici." />
      }
    />
  )
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
})
