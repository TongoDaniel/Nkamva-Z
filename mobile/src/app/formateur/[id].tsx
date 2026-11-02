import { ScrollView, StyleSheet, View } from 'react-native'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { ChevronRight } from 'lucide-react-native'
import { useTrainer } from '../../lib/queries'
import type { CourseListItem } from '../../lib/types'
import { Screen } from '../../ui/Screen'
import { Text } from '../../ui/Text'
import { Avatar, Card, CommunityAvatar, SectionTitle } from '../../ui/Bits'
import { ErrorState } from '../../ui/States'
import { Bone } from '../../ui/Skeleton'
import { colors } from '../../ui/theme'
import { CourseCard } from '../../components/cards'

/**
 * Fiche d'un formateur, comme le profil d'un créateur sur Patreon ou d'un
 * instructeur sur Udemy : qui il est, ce qu'il a publié, la communauté qu'il
 * anime. C'est souvent la personne qui décide un visiteur à s'inscrire.
 */
export default function Formateur() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const trainer = useTrainer(id)

  if (trainer.isLoading) {
    return <Screen edges={['bottom']}><Bone width={88} height={88} round /><Bone width="60%" height={26} /><Bone width="90%" /><Bone height={180} /></Screen>
  }
  if (trainer.isError || !trainer.data) {
    return <ErrorState message={(trainer.error as Error | null)?.message ?? 'Formateur introuvable.'} onRetry={() => trainer.refetch()} />
  }
  const t = trainer.data
  const stats = [
    { value: t.publishedCount, label: t.publishedCount > 1 ? 'ressources' : 'ressource' },
    { value: t.learners, label: t.learners > 1 ? 'apprenants' : 'apprenant' },
    t.experienceYears ? { value: t.experienceYears, label: t.experienceYears > 1 ? 'ans d’expérience' : 'an d’expérience' } : null,
  ].filter((s): s is NonNullable<typeof s> => !!s)
  // La carte du catalogue lit le formateur sur la ressource : on le recolle.
  const courses: CourseListItem[] = t.courses.map((c) => ({
    ...c,
    priceFcfa: 0,
    trainerProfile: { id: t.id, user: { fullName: t.fullName }, ratingAverage: t.ratingAverage, ratingCount: t.ratingCount },
  }))

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: '' }} />
      <View style={styles.head}>
        <Avatar name={t.fullName} uri={t.avatarUrl} size={88} />
        <Text variant="title" style={styles.center}>{t.fullName ?? 'Formateur NKAMVA'}</Text>
        {t.slogan ? <Text variant="body" style={styles.center}>{t.slogan}</Text> : null}
      </View>

      {/* Les chiffres comme sur un profil Instagram : valeur en gras, libellé dessous. */}
      <View style={styles.stats}>
        {stats.map((s) => (
          <View key={s.label} style={styles.stat}>
            <Text variant="heading">{s.value}</Text>
            <Text variant="caption" style={styles.center}>{s.label}</Text>
          </View>
        ))}
      </View>

      {t.domains.length ? (
        <View style={styles.domains}>
          {t.domains.map((d) => (
            <View key={d} style={styles.domain}><Text variant="caption" style={{ color: colors.ink2 }}>{d}</Text></View>
          ))}
        </View>
      ) : null}

      {t.description ? <Text variant="body">{t.description}</Text> : null}

      {t.community ? (
        <View>
          <SectionTitle title="Sa communauté" />
          <Card style={styles.community} onPress={() => router.push({ pathname: '/communaute/[slug]', params: { slug: t.community!.slug } })}>
            <CommunityAvatar name={t.community.name} size={52} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong" numberOfLines={1}>{t.community.name}</Text>
              <Text variant="caption">{t.community.membersCount} membre{t.community.membersCount > 1 ? 's' : ''}</Text>
              {t.community.description ? <Text variant="small" numberOfLines={2}>{t.community.description}</Text> : null}
            </View>
            <ChevronRight size={18} color={colors.hairline} />
          </Card>
        </View>
      ) : null}

      {courses.length ? (
        <View>
          <SectionTitle title="Ses ressources" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }} style={{ marginHorizontal: -20 }}>
            {courses.map((c) => <CourseCard key={c.id} course={c} width={168} />)}
          </ScrollView>
        </View>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: 8, paddingTop: 8 },
  center: { textAlign: 'center' },
  stats: { flexDirection: 'row', justifyContent: 'center', gap: 28, paddingVertical: 4 },
  stat: { alignItems: 'center', minWidth: 70 },
  domains: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  domain: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  community: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
})
