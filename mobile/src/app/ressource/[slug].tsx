import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { Check, Flag, Heart, Lock } from 'lucide-react-native'
import { useCourse, useFavorites, useResources, useToggleFavorite } from '../../lib/queries'
import { formatDuration, formatLabel } from '../../lib/format'
import { Screen } from '../../ui/Screen'
import { useAuth } from '../../lib/auth'
import { useRequireAccount } from '../../components/AccountGate'
import { Text } from '../../ui/Text'
import { Button } from '../../ui/Button'
import { Avatar, Card } from '../../ui/Bits'
import { Cover } from '../../ui/Cover'
import { ErrorState } from '../../ui/States'
import { Bone } from '../../ui/Skeleton'
import { colors } from '../../ui/theme'
import { ReportSheet, type ReportTarget } from '../../components/ReportSheet'

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
  const [report, setReport] = useState<ReportTarget | null>(null)
  const favorites = useFavorites()
  const toggleFavorite = useToggleFavorite()
  // Le cœur et le signalement demandent un compte : un visiteur voit pourquoi.
  const requireAccount = useRequireAccount()
  const { status } = useAuth()

  if (course.isLoading) return <DetailSkeleton />
  if (course.isError || !course.data) {
    return <ErrorState message={(course.error as Error | null)?.message ?? 'Ressource introuvable.'} onRetry={() => course.refetch()} />
  }

  const c = course.data
  const owned = resources.data?.find((r) => r.courseId === c.id)
  const duration = formatDuration(c.durationSeconds)
  const trainer = c.trainerProfile
  const favorited = !!favorites.data?.courses.some((f) => f.id === c.id)

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={() => requireAccount('favoris', () => toggleFavorite.mutate(c))}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={favorited ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              accessibilityState={{ selected: favorited }}
            >
              <Heart size={24} color={favorited ? colors.danger : colors.ink} fill={favorited ? colors.danger : 'transparent'} />
            </Pressable>
          ),
        }}
      />
      <Cover course={c} height={200} />

      <View style={{ gap: 6 }}>
        <Text variant="title">{c.title}</Text>
        <Text variant="body">{c.blurb}</Text>
      </View>

      {/* Bande d'infos comme sur une fiche de l'App Store : intitulé discret,
          valeur en dessous, séparées par un filet. Remplace la rangée de
          pastilles. */}
      <View style={styles.facts}>
        {[
          { k: 'Format', v: formatLabel(c.format) },
          { k: 'Catégorie', v: c.category },
          ...(duration ? [{ k: 'Durée', v: duration }] : []),
          ...(c.pageCount ? [{ k: 'Pages', v: String(c.pageCount) }] : []),
        ].map((f, i) => (
          <View key={f.k} style={[styles.fact, i > 0 && styles.factSep]}>
            <Text variant="caption" numberOfLines={1}>{f.k}</Text>
            <Text variant="label" numberOfLines={1} style={{ fontSize: 14 }}>{f.v}</Text>
          </View>
        ))}
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
        status !== 'signedIn' ? (
          // Visiteur : l'ouverture d'un compte, pas un achat. Aucun prix ni
          // lien de paiement dans l'app (règle 3.1.1 de l'App Store).
          <Card style={styles.notice}>
            <Text variant="bodyStrong">Crée ton compte pour la suivre</Text>
            <Text variant="small">Ta bibliothèque, ta progression et tes favoris te suivent sur ton téléphone comme sur le site.</Text>
            <Button label="Créer un compte" onPress={() => router.push('/inscription')} style={{ marginTop: 6 }} />
          </Card>
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
        )
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

      <Pressable onPress={() => requireAccount('signaler', () => setReport({ type: 'COURSE', id: c.id, label: 'cette ressource' }))} style={styles.report} accessibilityRole="button">
        <Flag size={15} color={colors.ink3} />
        <Text variant="small" style={{ color: colors.ink3 }}>Signaler cette ressource</Text>
      </Pressable>
      <ReportSheet target={report} onClose={() => setReport(null)} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  notice: { padding: 16, gap: 6 },
  facts: { flexDirection: 'row', paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  fact: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 6 },
  factSep: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.line },
  point: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  report: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  trainer: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
})
