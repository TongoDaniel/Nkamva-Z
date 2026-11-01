import { Alert, StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Archive, ExternalLink, Eye, Send } from 'lucide-react-native'
import { ApiError } from '../../../lib/api'
import { formatFcfa, formatLabel } from '../../../lib/format'
import { useCourseAction, useTrainerCourses, useTrainerOverview } from '../../../lib/studio'
import { Screen } from '../../../ui/Screen'
import { Text } from '../../../ui/Text'
import { Button } from '../../../ui/Button'
import { Cover } from '../../../ui/Cover'
import { ErrorState } from '../../../ui/States'
import { Bone } from '../../../ui/Skeleton'
import { colors } from '../../../ui/theme'
import { openTrainerPage } from '../../../components/studio'
import { STATUS_LABEL } from '../../(studio)/contenus'

/**
 * Une ressource vue par son formateur : ses chiffres et les deux décisions
 * qu'on prend volontiers depuis son téléphone, publier et archiver. La
 * modification du contenu et des textes reste sur le site.
 */
export default function RessourceFormateur() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const courses = useTrainerCourses()
  const panel = useTrainerOverview()
  const action = useCourseAction()
  const course = courses.data?.find((c) => c.id === id)
  const sales = panel.data?.salesByCourse.find((s) => s.courseId === id)

  if (courses.isLoading) {
    return (
      <Screen edges={['bottom']}>
        <Bone height={180} style={{ borderRadius: 16 }} />
        <Bone width="80%" height={26} />
        <Bone height={52} round />
      </Screen>
    )
  }
  if (!course) return <ErrorState message="Cette ressource est introuvable." onRetry={() => courses.refetch()} />

  function run(kind: 'publish' | 'archive') {
    action.mutate(
      { courseId: course!.id, action: kind },
      {
        onSuccess: () => Alert.alert(kind === 'publish' ? 'Ressource publiée' : 'Ressource archivée', kind === 'publish' ? 'Elle est visible dans le catalogue.' : 'Elle n’est plus proposée. Ceux qui l’ont achetée la gardent.'),
        onError: (err) => Alert.alert(kind === 'publish' ? 'Publication impossible' : 'Archivage impossible', err instanceof ApiError ? err.message : ''),
      },
    )
  }

  function confirmArchive() {
    Alert.alert('Archiver cette ressource ?', 'Elle disparaîtra du catalogue. Les personnes qui l’ont déjà achetée en gardent l’accès.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Archiver', style: 'destructive', onPress: () => run('archive') },
    ])
  }

  return (
    <Screen edges={['bottom']} refreshing={courses.isRefetching} onRefresh={() => { void courses.refetch(); void panel.refetch() }}>
      <Cover course={course} height={180} />
      <View style={{ gap: 6 }}>
        <Text variant="caption">{formatLabel(course.format)} · {course.circuit === 'COMMUNITY' ? 'Réservée à ta communauté' : 'Catalogue'}</Text>
        <Text variant="title">{course.title}</Text>
        <Text variant="body">{course.blurb}</Text>
      </View>

      <View style={styles.facts}>
        {[
          { k: 'Statut', v: STATUS_LABEL[course.status] },
          { k: 'Ventes', v: String(sales?.salesCount ?? 0) },
          { k: 'Revenus nets', v: formatFcfa(sales?.netRevenueFcfa ?? 0) },
        ].map((f, i) => (
          <View key={f.k} style={[styles.fact, i > 0 && styles.factSep]}>
            <Text variant="caption" numberOfLines={1}>{f.k}</Text>
            <Text variant="label" numberOfLines={1} style={{ fontSize: 14 }}>{f.v}</Text>
          </View>
        ))}
      </View>

      <View style={{ gap: 10 }}>
        {course.status === 'draft' ? (
          <Button label="Publier" icon={<Send size={18} color="#fff" />} onPress={() => run('publish')} loading={action.isPending} />
        ) : null}
        {course.status === 'published' ? (
          <Button label="Voir la fiche" tone="secondary" icon={<Eye size={18} color={colors.ink} />} onPress={() => router.push(`/ressource/${course.slug}`)} />
        ) : null}
        <Button label="Modifier sur le site" tone="secondary" icon={<ExternalLink size={18} color={colors.ink} />} onPress={() => openTrainerPage(`/formateur/ressources/${course.id}`)} />
        {course.status === 'published' ? (
          <Button label="Archiver" tone="danger" icon={<Archive size={18} color={colors.danger} />} onPress={confirmArchive} loading={action.isPending} />
        ) : null}
        {course.status === 'draft' && !course.contentS3Key ? (
          <Text variant="caption" style={{ paddingHorizontal: 4 }}>Le fichier de la ressource n’est pas encore déposé : la publication sera refusée tant qu’il manque.</Text>
        ) : null}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  facts: { flexDirection: 'row', paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  fact: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  factSep: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.line },
})
