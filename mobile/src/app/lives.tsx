import { FlatList, View } from 'react-native'
import { Radio } from 'lucide-react-native'
import { useLives } from '../lib/queries'
import { Text } from '../ui/Text'
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
      // Note de bas de liste, comme les pieds de section des Réglages iOS,
      // plutôt qu'un encadré beige en tête.
      ListFooterComponent={
        upcoming.length ? (
          <Text variant="caption" style={{ paddingHorizontal: 4, marginTop: 4 }}>
            Un quart d’heure avant le début, un bouton te permet d’entrer dans la salle. Elle s’ouvre dans le navigateur ; la vidéo directement dans l’app arrive bientôt.
          </Text>
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
