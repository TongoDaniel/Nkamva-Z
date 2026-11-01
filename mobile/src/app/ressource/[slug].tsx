import { StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Check, Lock } from 'lucide-react-native'
import { useCourse, useResources } from '../../lib/queries'
import { formatDuration, formatLabel } from '../../lib/format'
import { Screen } from '../../ui/Screen'
import { Text } from '../../ui/Text'
import { Button } from '../../ui/Button'
import { Avatar, Card, Chip } from '../../ui/Bits'
import { Cover } from '../../ui/Cover'
import { ErrorState } from '../../ui/States'
import { Bone } from '../../ui/Skeleton'
import { colors } from '../../ui/theme'

/**
 * Fiche d'une ressource. Pas de prix ni de bouton d'achat : la vente passe par
 * le site (docs/application-mobile.md § 3). Si la ressource est dans la
 * bibliothèque, on l'ouvre ; sinon on le dit, sans renvoyer vers le paiement.
 */
function DetailSkeleton() {
  return (
    <Screen edges={['bottom']}>
      <Bone height={200} style={{ borderRadius: 16 }} />
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Bone width={60} height={22} round />
        <Bone width={80} height={22} round />
      </View>
      <Bone width="90%" height={26} />
      <Bone width="70%" height={26} />
      <Bone width="100%" />
      <Bone width="95%" />
      <Bone height={52} round style={{ marginTop: 8 }} />
    </Screen>
  )
}

export default function Ressource() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const course = useCourse(slug)
  const resources = useResources()

  if (course.isLoading) return <DetailSkeleton />
  if (course.isError || !course.data) {
    return <ErrorState message={(course.error as Error | null)?.message ?? 'Ressource introuvable.'} onRetry={() => course.refetch()} />
  }

  const c = course.data
  const owned = resources.data?.find((r) => r.courseId === c.id)
  const duration = formatDuration(c.durationSeconds)
  const trainer = c.trainerProfile

  return (
    <Screen edges={['bottom']}>
      <Cover course={c} height={200} />

      <View style={{ gap: 10 }}>
        <View style={styles.row}>
          <Chip label={formatLabel(c.format)} />
          <Chip label={c.category} />
          {duration ? <Chip label={duration} /> : null}
          {c.pageCount ? <Chip label={`${c.pageCount} pages`} /> : null}
        </View>
        <Text variant="title">{c.title}</Text>
        <Text variant="body">{c.blurb}</Text>
      </View>

      {owned ? (
        owned.accessSuspended ? (
          <Card style={styles.notice}>
            <Text variant="bodyStrong">Accès suspendu</Text>
            <Text variant="small">Un litige est en cours sur cette ressource. Tu retrouveras l’accès dès sa résolution.</Text>
          </Card>
        ) : (
          <Button label="Ouvrir" onPress={() => router.push(`/lecteur/${c.id}`)} />
        )
      ) : (
        <Card style={styles.notice}>
          <View style={styles.row}>
            <Lock size={18} color={colors.ink2} />
            <Text variant="bodyStrong">Pas encore dans ta bibliothèque</Text>
          </View>
          <Text variant="small">
            {c.circuit === 'COMMUNITY'
              ? 'Cette ressource est réservée aux membres de la communauté de son formateur.'
              : 'Elle apparaîtra ici dès qu’elle fera partie de ton compte.'}
          </Text>
        </Card>
      )}

      {c.learnPoints?.length ? (
        <View style={{ gap: 10 }}>
          <Text variant="heading">Ce que tu vas apprendre</Text>
          {c.learnPoints.map((point) => (
            <View key={point} style={styles.point}>
              <Check size={18} color={colors.brand} style={{ marginTop: 3 }} />
              <Text variant="body" style={{ flex: 1 }}>{point}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {c.description ? (
        <View style={{ gap: 8 }}>
          <Text variant="heading">Présentation</Text>
          <Text variant="body">{c.description}</Text>
        </View>
      ) : null}

      {c.includes?.length ? (
        <View style={{ gap: 8 }}>
          <Text variant="heading">Inclus</Text>
          {c.includes.map((inc) => <Text key={inc} variant="body">• {inc}</Text>)}
        </View>
      ) : null}

      <Card style={styles.trainer}>
        <Avatar name={trainer.user.fullName} size={52} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong">{trainer.user.fullName ?? 'Formateur NKAMVA'}</Text>
          {trainer.slogan ? <Text variant="small" numberOfLines={2}>{trainer.slogan}</Text> : null}
        </View>
      </Card>
      {trainer.description ? <Text variant="body">{trainer.description}</Text> : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  notice: { padding: 16, gap: 6, backgroundColor: colors.paper, borderColor: colors.line },
  point: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  trainer: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
})
