import { useState } from 'react'
import { Alert, Pressable, StyleSheet, View } from 'react-native'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { AlertCircle, ChevronRight, CircleCheck, Flag, MessageCircle, Send } from 'lucide-react-native'
import { ReportSheet, type ReportTarget } from '../../components/ReportSheet'
import { useCommunitySpace, useOpenTrainerConversation, useResources } from '../../lib/queries'
import { formatDate, formatLabel } from '../../lib/format'
import { Screen } from '../../ui/Screen'
import { Text } from '../../ui/Text'
import { Button } from '../../ui/Button'
import { Card, CommunityAvatar, Divider, SectionTitle } from '../../ui/Bits'
import { Cover } from '../../ui/Cover'
import { ErrorState } from '../../ui/States'
import { Bone } from '../../ui/Skeleton'
import { colors } from '../../ui/theme'
import { LiveCard } from '../../components/cards'

function SpaceSkeleton() {
  return (
    <Screen edges={['bottom']}>
      <Bone height={120} style={{ borderRadius: 16 }} />
      <Bone height={52} round />
      <Bone width={160} height={20} />
      <Bone height={72} style={{ borderRadius: 16 }} />
      <Bone height={72} style={{ borderRadius: 16 }} />
    </Screen>
  )
}

/**
 * L'espace d'une communauté dont on est membre : son groupe, le fil privé avec
 * l'animateur, ses lives et ses ressources incluses. Rien sur le prix ni le
 * paiement de l'adhésion : ils restent sur le site (docs/application-mobile.md § 3).
 */
export default function Communaute() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const space = useCommunitySpace(slug)
  const resources = useResources()
  const openDm = useOpenTrainerConversation()
  const [expanded, setExpanded] = useState(false)
  const [report, setReport] = useState<ReportTarget | null>(null)

  if (space.isLoading) return <SpaceSkeleton />
  if (space.isError || !space.data) {
    return <ErrorState message={(space.error as Error | null)?.message ?? 'Communauté introuvable.'} onRetry={() => space.refetch()} />
  }

  const s = space.data
  const owned = new Set(resources.data?.map((r) => r.courseId))
  const upcoming = s.sessions.filter((l) => l.status === 'SCHEDULED' || l.status === 'LIVE')
  const m = s.membership

  async function writeToTrainer() {
    try {
      const conversation = await openDm.mutateAsync(s.slug)
      router.push({ pathname: '/conversation/[id]', params: { id: conversation.id, title: s.trainerName ?? '' } })
    } catch (err) {
      Alert.alert('Impossible d’ouvrir la discussion', err instanceof Error ? err.message : '')
    }
  }

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: '' }} />

      <View style={styles.head}>
        <CommunityAvatar name={s.name} size={64} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="title" numberOfLines={2}>{s.name}</Text>
          <Text variant="small">Animée par {s.trainerName ?? 'ton formateur'}</Text>
        </View>
      </View>

      {/* L'état de l'adhésion en une ligne de texte, comme sur la page d'un
          abonnement Patreon : pas de pastille colorée. */}
      {m ? (
        m.status === 'PAST_DUE' ? (
          <Status warn text="Renouvellement en attente" />
        ) : m.canceledAt ? (
          <Status warn text={`Résiliée · accès jusqu’au ${formatDate(m.periodEnd)}`} />
        ) : (
          <Status text={`Membre · renouvellement le ${formatDate(m.periodEnd)}`} />
        )
      ) : s.isTrainer ? (
        <Status text="Tu animes cette communauté" />
      ) : null}

      <View style={{ gap: 10 }}>
        {s.groupConversationId ? (
          <Button
            label="Ouvrir le groupe"
            icon={<MessageCircle size={18} color="#fff" />}
            onPress={() => router.push({ pathname: '/conversation/[id]', params: { id: s.groupConversationId!, title: s.name } })}
          />
        ) : null}
        {s.messagingEnabled && !s.isTrainer ? (
          <Button
            label={`Écrire à ${s.trainerName?.split(' ')[0] ?? 'l’animateur'}`}
            tone="secondary"
            icon={<Send size={18} color={colors.ink} />}
            onPress={writeToTrainer}
            loading={openDm.isPending}
          />
        ) : null}
      </View>

      {s.eventsEnabled ? (
        <View>
          <SectionTitle title="Prochains lives" />
          {upcoming.length ? (
            <View style={{ gap: 12 }}>{upcoming.map((l) => <LiveCard key={l.id} session={l} />)}</View>
          ) : (
            <Text variant="small">Aucune séance programmée pour l’instant.</Text>
          )}
          {s.replaysCount > 0 ? (
            <Text variant="caption" style={{ marginTop: 8 }}>
              {s.replaysCount} rediffusion{s.replaysCount > 1 ? 's' : ''} disponible{s.replaysCount > 1 ? 's' : ''} sur le site.
            </Text>
          ) : null}
        </View>
      ) : null}

      {s.resourcesEnabled && s.courses.length ? (
        <View>
          <SectionTitle title={`Ressources incluses · ${s.courses.length}`} />
          <Card style={{ overflow: 'hidden' }}>
            {s.courses.map((course, i) => (
              <View key={course.id}>
                {i > 0 ? <Divider inset={86} /> : null}
                <Pressable
                  onPress={() => router.push(owned.has(course.id) ? `/lecteur/${course.id}` : `/ressource/${course.slug}`)}
                  style={({ pressed }) => [styles.course, pressed && { backgroundColor: colors.paper }]}
                >
                  <Cover course={course} height={56} style={{ width: 56 }} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="label" numberOfLines={2}>{course.title}</Text>
                    <Text variant="caption">{formatLabel(course.format)}</Text>
                  </View>
                  <ChevronRight size={18} color={colors.hairline} />
                </Pressable>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      {s.description ? (
        <View style={{ gap: 6 }}>
          <Text variant="heading">À propos</Text>
          <Text variant="body" numberOfLines={expanded ? undefined : 4}>{s.description}</Text>
          {s.description.length > 140 ? (
            <Pressable onPress={() => setExpanded((e) => !e)} hitSlop={8}>
              <Text variant="label" style={{ color: colors.brand }}>{expanded ? 'Voir moins' : 'Lire la suite'}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {!s.isTrainer ? (
        <Pressable onPress={() => setReport({ type: 'COMMUNITY', id: s.communityId, label: 'cette communauté' })} style={styles.report} accessibilityRole="button">
          <Flag size={15} color={colors.ink3} />
          <Text variant="small" style={{ color: colors.ink3 }}>Signaler cette communauté</Text>
        </Pressable>
      ) : null}
      <ReportSheet target={report} onClose={() => setReport(null)} />
    </Screen>
  )
}

function Status({ text, warn }: { text: string; warn?: boolean }) {
  const color = warn ? colors.goldInk : colors.success
  return (
    <View style={styles.status}>
      {warn ? <AlertCircle size={16} color={color} /> : <CircleCheck size={16} color={color} />}
      <Text variant="small" style={{ color: warn ? color : colors.ink2, flexShrink: 1 }}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  report: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  course: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 10 },
})
