import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useCatalog, useCommunities } from '../lib/queries'
import { Screen } from '../ui/Screen'
import { Text } from '../ui/Text'
import { Button } from '../ui/Button'
import { Card, CommunityAvatar, Divider, SectionTitle } from '../ui/Bits'
import { Bone, CourseCardSkeleton, Repeat } from '../ui/Skeleton'
import { colors } from '../ui/theme'
import { CourseCard } from './cards'

/**
 * Accueil d'un visiteur, sans compte. Comme l'accueil d'Airbnb ou d'Udemy
 * avant inscription : ce qu'on propose d'abord (ressources, communautés et
 * leurs formateurs), et une invitation discrète à créer un compte, qui ne
 * bloque rien.
 */
export function GuestHome() {
  const catalog = useCatalog('', null)
  const communities = useCommunities()
  const courses = catalog.data?.pages[0]?.data.slice(0, 8) ?? []
  const open = (communities.data ?? []).filter((c) => c.visibility === 'PUBLIC').slice(0, 5)

  return (
    <Screen refreshing={catalog.isRefetching} onRefresh={() => { void catalog.refetch(); void communities.refetch() }}>
      <View style={{ gap: 6 }}>
        <Text variant="title">Apprends avec les formateurs d’Afrique</Text>
        <Text variant="body">Vidéos, guides et kits pratiques, et des communautés pour progresser ensemble.</Text>
      </View>

      <View>
        <SectionTitle title="À découvrir" action={<Pressable onPress={() => router.navigate('/explorer')} hitSlop={8}><Text variant="label" style={{ color: colors.brand }}>Tout voir</Text></Pressable>} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }} style={{ marginHorizontal: -20 }}>
          {catalog.isLoading
            ? <><CourseCardSkeleton width={168} /><CourseCardSkeleton width={168} /></>
            : courses.map((c) => <CourseCard key={c.id} course={c} width={168} />)}
        </ScrollView>
      </View>

      <View>
        <SectionTitle title="Communautés" />
        {communities.isLoading ? (
          <Repeat count={3}><Bone height={48} style={{ marginBottom: 14 }} /></Repeat>
        ) : (
          open.map((c, i) => (
            <View key={c.id}>
              {i > 0 ? <Divider inset={60} /> : null}
              <Pressable
                onPress={() => router.push({ pathname: '/communaute/[slug]', params: { slug: c.slug } })}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
                accessibilityRole="button"
              >
                <CommunityAvatar name={c.name} size={46} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyStrong" numberOfLines={1}>{c.name}</Text>
                  <Text variant="caption" numberOfLines={1}>Animée par {c.trainerName} · {c.membersCount} membre{c.membersCount > 1 ? 's' : ''}</Text>
                </View>
              </Pressable>
            </View>
          ))
        )}
      </View>

      {/* L'invitation au compte vient après ce qu'on propose, pas avant. */}
      <Card style={styles.invite}>
        <Text variant="heading">Ton espace d’apprentissage</Text>
        <Text variant="small">Crée ton compte pour suivre ta progression, garder tes favoris et rejoindre des communautés.</Text>
        <View style={{ gap: 10, marginTop: 6 }}>
          <Button label="Créer un compte" onPress={() => router.push('/inscription')} />
          <Button label="J’ai déjà un compte" tone="ghost" onPress={() => router.push('/connexion')} />
        </View>
      </Card>
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 },
  invite: { padding: 18, gap: 6 },
})
