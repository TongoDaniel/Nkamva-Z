import { FlatList, View } from 'react-native'
import { Users } from 'lucide-react-native'
import { useMyCommunities } from '../lib/queries'
import { EmptyState, ErrorState } from '../ui/States'
import { Bone, Repeat } from '../ui/Skeleton'
import { colors } from '../ui/theme'
import { CommunityCard } from '../components/CommunityCard'

export default function Communautes() {
  const communities = useMyCommunities()

  if (communities.isLoading) {
    return (
      <View style={{ padding: 20, gap: 12 }}>
        <Repeat count={3}><Bone height={74} style={{ borderRadius: 16, marginBottom: 12 }} /></Repeat>
      </View>
    )
  }
  if (communities.isError) {
    return <ErrorState message={(communities.error as Error).message} onRetry={() => communities.refetch()} />
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      data={communities.data}
      keyExtractor={(c) => c.subscriptionId}
      contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 40 }}
      refreshing={communities.isRefetching}
      onRefresh={() => communities.refetch()}
      renderItem={({ item }) => <CommunityCard item={item} />}
      ListEmptyComponent={
        <EmptyState
          icon={<Users color={colors.brand} />}
          title="Aucune communauté"
          body="Les communautés que tu rejoins apparaissent ici, avec leurs ressources, leurs lives et leur groupe."
        />
      }
    />
  )
}
