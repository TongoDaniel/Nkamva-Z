import { Pressable, StyleSheet, View } from 'react-native'
import { router, Stack } from 'expo-router'
import { BookOpen, ChevronRight, MessagesSquare, Video } from 'lucide-react-native'
import { useAuth } from '../lib/auth'
import { formatLabel } from '../lib/format'
import { usePublicCommunity } from '../lib/queries'
import { Screen } from '../ui/Screen'
import { Text } from '../ui/Text'
import { Button } from '../ui/Button'
import { Card, CommunityAvatar, Divider, SectionTitle } from '../ui/Bits'
import { Cover } from '../ui/Cover'
import { ErrorState } from '../ui/States'
import { Bone } from '../ui/Skeleton'
import { colors } from '../ui/theme'

/**
 * Fiche d'une communauté pour qui n'en est pas membre, comme la page d'un
 * groupe Facebook ou d'un serveur Discord avant d'y entrer : qui l'anime, ce
 * qu'on y trouve, les ressources incluses, les règles. Ni prix ni bouton
 * d'adhésion : l'adhésion se paie sur le site (règle 3.1.1 de l'App Store).
 */
export function PublicCommunity({ slug }: { slug: string }) {
  const { status } = useAuth()
  const community = usePublicCommunity(slug)

  if (community.isLoading) {
    return <Screen edges={['bottom']}><Bone height={64} /><Bone height={90} /><Bone height={52} round /></Screen>
  }
  if (community.isError || !community.data) {
    return <ErrorState message={(community.error as Error | null)?.message ?? 'Communauté introuvable.'} onRetry={() => community.refetch()} />
  }
  const c = community.data
  const features = [
    c.forumEnabled ? { Icon: MessagesSquare, text: 'Un groupe d’entraide avec les autres membres et l’animateur' } : null,
    c.eventsEnabled ? { Icon: Video, text: 'Des lives réguliers, à suivre en direct' } : null,
    c.resourcesEnabled && c.courses.length ? { Icon: BookOpen, text: `${c.courses.length} ressource${c.courses.length > 1 ? 's' : ''} incluse${c.courses.length > 1 ? 's' : ''}` } : null,
  ].filter((f): f is NonNullable<typeof f> => !!f)

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: '' }} />
      <View style={styles.head}>
        <CommunityAvatar name={c.name} size={64} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="title" numberOfLines={2}>{c.name}</Text>
          <Text variant="small">Animée par {c.trainer.fullName ?? 'un formateur NKAMVA'} · {c.membersCount} membre{c.membersCount > 1 ? 's' : ''}</Text>
        </View>
      </View>

      {c.description ? <Text variant="body">{c.description}</Text> : null}

      {features.length ? (
        <View style={{ gap: 12 }}>
          <Text variant="heading">Ce que tu y trouves</Text>
          {features.map(({ Icon, text }) => (
            <View key={text} style={styles.feature}>
              <Icon size={20} color={colors.ink2} />
              <Text variant="body" style={{ flex: 1 }}>{text}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {status !== 'signedIn' ? (
        <Card style={styles.notice}>
          <Text variant="bodyStrong">Crée ton compte pour la rejoindre</Text>
          <Text variant="small">Une fois membre, tu retrouves dans l’app le groupe, les lives et les ressources incluses.</Text>
          <Button label="Créer un compte" onPress={() => router.push('/inscription')} style={{ marginTop: 6 }} />
          <Button label="J’ai déjà un compte" tone="ghost" onPress={() => router.push('/connexion')} />
        </Card>
      ) : (
        <Card style={styles.notice}>
          <Text variant="bodyStrong">Tu n’es pas encore membre</Text>
          <Text variant="small">Dès ton adhésion, le groupe, les lives et les ressources incluses apparaîtront ici.</Text>
        </Card>
      )}

      {c.courses.length ? (
        <View>
          <SectionTitle title="Ressources incluses" />
          <Card style={{ overflow: 'hidden' }}>
            {c.courses.map((course, i) => (
              <View key={course.id}>
                {i > 0 ? <Divider inset={84} /> : null}
                <Pressable
                  onPress={() => router.push(`/ressource/${course.slug}`)}
                  style={({ pressed }) => [styles.course, pressed && { backgroundColor: colors.paper }]}
                  accessibilityRole="button"
                >
                  <Cover course={course} height={56} style={{ width: 56 }} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="bodyStrong" numberOfLines={2}>{course.title}</Text>
                    <Text variant="caption">{formatLabel(course.format)}</Text>
                  </View>
                  <ChevronRight size={18} color={colors.hairline} />
                </Pressable>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      {c.rules ? (
        <View style={{ gap: 8 }}>
          <Text variant="heading">Règles</Text>
          <Text variant="small">{c.rules}</Text>
        </View>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  feature: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  notice: { padding: 16, gap: 6 },
  course: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 10 },
})
