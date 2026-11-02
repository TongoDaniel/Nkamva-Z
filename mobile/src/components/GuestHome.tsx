import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { Check, Search } from 'lucide-react-native'
import { NO_FILTERS, useCatalog, useCatalogFacets, useCommunities, useTrainers } from '../lib/queries'
import { Screen } from '../ui/Screen'
import { Text } from '../ui/Text'
import { Button } from '../ui/Button'
import { Avatar, Card, Divider, SectionTitle } from '../ui/Bits'
import { Bone, CourseCardSkeleton, Repeat } from '../ui/Skeleton'
import { colors, radius } from '../ui/theme'
import { CourseCard } from './cards'
import { CommunityRow } from './discovery'

const POPULAR = { ...NO_FILTERS, sort: 'popular' as const }

const BENEFITS = [
  'Ta progression gardée, sur le téléphone comme sur le site',
  'Tes ressources disponibles hors ligne',
  'Les groupes et les lives de tes communautés',
  'Tes favoris, pour décider plus tard',
]

function SeeAll({ onPress, label = 'Tout voir' }: { onPress: () => void; label?: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button">
      <Text variant="label" style={{ color: colors.brand }}>{label}</Text>
    </Pressable>
  )
}

/**
 * Accueil d'un visiteur, sans compte. Il doit répondre vite à « qu'est-ce que
 * j'y gagne ? » : par où chercher (la barre et les thèmes, comme l'accueil
 * d'Airbnb ou d'Udemy), ce qui est le plus suivi, les communautés et les
 * formateurs, des gens réels. Le compte vient en dernier, avec ce qu'il
 * apporte, sans rien bloquer.
 */
export function GuestHome() {
  const popular = useCatalog(POPULAR)
  const facets = useCatalogFacets()
  const communities = useCommunities()
  const trainers = useTrainers()
  const courses = popular.data?.pages[0]?.data.slice(0, 8) ?? []
  const ranked = popular.data?.pages[0]?.meta?.ranked === true
  const open = (communities.data?.pages[0]?.data ?? []).filter((c) => c.visibility === 'PUBLIC').slice(0, 3)
  const people = (trainers.data ?? []).slice(0, 10)
  const themes = facets.data?.categories ?? []

  const refresh = () => { void popular.refetch(); void facets.refetch(); void communities.refetch(); void trainers.refetch() }

  return (
    <Screen refreshing={popular.isRefetching && !popular.isPlaceholderData} onRefresh={refresh}>
      <View style={{ gap: 6 }}>
        <Text variant="title">Apprends avec les formateurs d’Afrique</Text>
        <Text variant="body">Vidéos, guides et kits pratiques, et des communautés pour progresser ensemble.</Text>
      </View>

      {/* Fausse barre de recherche, comme celle d'Airbnb : elle mène à
          Explorer, où la vraie s'ouvre. */}
      <Pressable onPress={() => router.navigate('/explorer')} style={styles.search} accessibilityRole="search" accessibilityLabel="Rechercher une ressource, une communauté, un formateur">
        <Search size={20} color={colors.ink3} />
        <Text variant="body" style={{ color: colors.ink3 }}>Une compétence, un formateur…</Text>
      </Pressable>

      {themes.length || facets.isLoading ? (
        <View>
          <SectionTitle title="Par thème" />
          <View style={styles.themes}>
            {facets.isLoading
              ? <Repeat count={4}><Bone height={64} style={{ width: '48%', borderRadius: 14 }} /></Repeat>
              : themes.slice(0, 6).map((t) => (
                <Pressable
                  key={t.value}
                  onPress={() => router.navigate({ pathname: '/explorer', params: { theme: t.value } })}
                  style={({ pressed }) => [styles.theme, pressed && { backgroundColor: colors.paper }]}
                  accessibilityRole="button"
                >
                  <Text variant="bodyStrong" numberOfLines={1}>{t.value}</Text>
                  <Text variant="caption">{t.count} ressource{t.count > 1 ? 's' : ''}</Text>
                </Pressable>
              ))}
          </View>
        </View>
      ) : null}

      <View>
        {/* « Les plus suivies » seulement si les ventes classent vraiment ;
            sinon on dit ce que c'est : des nouveautés. */}
        <SectionTitle title={ranked ? 'Les plus suivies' : 'Nouveautés'} action={<SeeAll onPress={() => router.navigate('/explorer')} />} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }} style={{ marginHorizontal: -20 }}>
          {popular.isLoading
            ? <><CourseCardSkeleton width={168} /><CourseCardSkeleton width={168} /></>
            : courses.map((c) => <CourseCard key={c.id} course={c} width={168} />)}
        </ScrollView>
      </View>

      <View>
        <SectionTitle title="Communautés à rejoindre" action={<SeeAll onPress={() => router.navigate('/communautes')} />} />
        <Text variant="small" style={{ marginBottom: 4 }}>Un groupe animé par un formateur : entraide, lives et ressources incluses.</Text>
        {communities.isLoading ? (
          <Repeat count={3}><Bone height={60} style={{ marginVertical: 8 }} /></Repeat>
        ) : (
          open.map((c, i) => (
            <View key={c.id}>
              {i > 0 ? <Divider inset={66} /> : null}
              <CommunityRow c={c} />
            </View>
          ))
        )}
      </View>

      {people.length || trainers.isLoading ? (
        <View>
          <SectionTitle title="Les formateurs" action={<SeeAll onPress={() => router.navigate({ pathname: '/explorer', params: { vue: 'formateurs' } })} />} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingHorizontal: 20 }} style={{ marginHorizontal: -20 }}>
            {trainers.isLoading
              ? <Repeat count={4}><Bone width={72} height={72} round /></Repeat>
              : people.map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => router.push({ pathname: '/formateur/[id]', params: { id: t.id } })}
                  style={styles.person}
                  accessibilityRole="button"
                  accessibilityLabel={t.fullName ?? 'Formateur NKAMVA'}
                >
                  <Avatar name={t.fullName} uri={t.avatarUrl} size={72} />
                  <Text variant="caption" numberOfLines={2} style={styles.personName}>{t.fullName ?? 'Formateur'}</Text>
                </Pressable>
              ))}
          </ScrollView>
        </View>
      ) : null}

      {/* L'invitation au compte vient après ce qu'on propose, pas avant, et
          dit ce que le compte apporte. */}
      <Card style={styles.invite}>
        <Text variant="heading">Ton espace d’apprentissage</Text>
        <View style={{ gap: 8, marginTop: 4 }}>
          {BENEFITS.map((b) => (
            <View key={b} style={styles.benefit}>
              <Check size={18} color={colors.success} strokeWidth={2.5} />
              <Text variant="small" style={{ flex: 1, color: colors.ink2 }}>{b}</Text>
            </View>
          ))}
        </View>
        <View style={{ gap: 10, marginTop: 10 }}>
          <Button label="Créer un compte gratuit" onPress={() => router.push('/inscription')} />
          <Button label="J’ai déjà un compte" tone="ghost" onPress={() => router.push('/connexion')} />
        </View>
      </Card>

      {/* L'autre public de NKAMVA : ceux qui enseignent. */}
      <Pressable onPress={() => router.push({ pathname: '/rejoindre', params: { raison: 'formateur' } })} style={styles.teach} accessibilityRole="button">
        <Text variant="small" style={{ color: colors.ink2 }}>Tu enseignes ? <Text variant="small" style={{ color: colors.brand, fontFamily: undefined }}>Deviens formateur</Text></Text>
      </Pressable>

    </Screen>
  )
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.paper, borderRadius: radius.pill, paddingHorizontal: 16, minHeight: 48 },
  themes: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  theme: { width: '48.5%', borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, gap: 2 },
  person: { width: 76, alignItems: 'center', gap: 6 },
  personName: { textAlign: 'center' },
  invite: { padding: 18, gap: 6 },
  benefit: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  teach: { alignItems: 'center', paddingVertical: 4 },
})
