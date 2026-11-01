import { FlatList, useWindowDimensions, View } from 'react-native'
import { router } from 'expo-router'
import { Heart } from 'lucide-react-native'
import { useFavorites, useResources } from '../lib/queries'
import { Button } from '../ui/Button'
import { EmptyState, ErrorState } from '../ui/States'
import { CourseCardSkeleton, Repeat } from '../ui/Skeleton'
import { colors } from '../ui/theme'
import { CourseCard } from '../components/cards'

const GAP = 12

export default function Favoris() {
  const favorites = useFavorites()
  const resources = useResources()
  const owned = new Set(resources.data?.map((r) => r.courseId))
  const { width } = useWindowDimensions()
  const cardWidth = Math.floor((width - 40 - GAP) / 2)

  if (favorites.isLoading) {
    return (
      <View style={{ padding: 20, flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
        <Repeat count={4}><CourseCardSkeleton width={cardWidth} /></Repeat>
      </View>
    )
  }
  if (favorites.isError) {
    return <ErrorState message={(favorites.error as Error).message} onRetry={() => favorites.refetch()} />
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      data={favorites.data?.courses ?? []}
      keyExtractor={(c) => c.id}
      numColumns={2}
      columnWrapperStyle={{ gap: GAP }}
      contentContainerStyle={{ padding: 20, gap: GAP, paddingBottom: 40 }}
      refreshing={favorites.isRefetching}
      onRefresh={() => favorites.refetch()}
      renderItem={({ item }) => <CourseCard course={item} owned={owned.has(item.id)} width={cardWidth} />}
      ListEmptyComponent={
        <EmptyState
          icon={<Heart color={colors.ink3} size={40} strokeWidth={1.5} />}
          title="Aucun favori"
          body="Touche le cœur d’une ressource pour la retrouver ici."
          action={<Button label="Explorer" tone="secondary" onPress={() => router.navigate('/explorer')} />}
        />
      }
    />
  )
}
