import { FlatList, View } from 'react-native'
import { Radio } from 'lucide-react-native'
import { useLives } from '../lib/queries'
import { Text } from '../ui/Text'
import { Card } from '../ui/Bits'
import { EmptyState, ErrorState, Loading } from '../ui/States'
import { colors } from '../ui/theme'
import { LiveCard } from '../components/cards'

/**
 * Agenda des séances de mes communautés. Rejoindre en vidéo arrive en V1.1
 * (`docs/application-mobile.md` § 4) : d'ici là, l'app prévient et le live se
 * suit depuis le site.
 */
export default function Lives() {
  const lives = useLives()
  if (lives.isLoading) return <Loading />
  if (lives.isError) return <ErrorState message={(lives.error as Error).message} onRetry={() => lives.refetch()} />
  const upcoming = (lives.data ?? []).filter((l) => l.status === 'SCHEDULED' || l.status === 'LIVE')

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      data={upcoming}
      keyExtractor={(l) => l.id}
      contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 40 }}
      refreshing={lives.isRefetching}
      onRefresh={() => lives.refetch()}
      ListHeaderComponent={
        upcoming.length ? (
          <Card style={{ padding: 14, backgroundColor: colors.paper, marginBottom: 4 }}>
            <Text variant="small">Bientôt : rejoindre les lives directement depuis l’app. Pour l’instant, ils se suivent sur nkamva.com.</Text>
          </Card>
        ) : undefined
      }
      renderItem={({ item }) => <LiveCard session={item} />}
      ListEmptyComponent={
        <View style={{ flex: 1 }}>
          <EmptyState icon={<Radio color={colors.brand} />} title="Aucun live prévu" body="Les séances programmées dans tes communautés s’afficheront ici." />
        </View>
      }
    />
  )
}
