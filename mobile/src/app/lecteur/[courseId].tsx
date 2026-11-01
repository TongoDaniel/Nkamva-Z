import { useState } from 'react'
import { Alert, StyleSheet, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Download, FileText } from 'lucide-react-native'
import { api, ApiError } from '../../lib/api'
import { keys, useContent, useResources, useSaveProgress } from '../../lib/queries'
import { downloadAndOpen } from '../../lib/open-file'
import { formatDuration, formatLabel } from '../../lib/format'
import { Screen } from '../../ui/Screen'
import { Text } from '../../ui/Text'
import { Button } from '../../ui/Button'
import { Card, Progress } from '../../ui/Bits'
import { Cover } from '../../ui/Cover'
import { ErrorState } from '../../ui/States'
import { Bone } from '../../ui/Skeleton'
import { colors } from '../../ui/theme'
import { VideoLesson } from '../../components/VideoLesson'
import { readingPercent } from '../../components/cards'

const ARCHIVES = ['kit', 'notion', 'tableur']

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

export default function Lecteur() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>()
  const queryClient = useQueryClient()
  const resources = useResources()
  const content = useContent(courseId)
  const save = useSaveProgress(courseId)
  const [opening, setOpening] = useState(false)

  const item = resources.data?.find((r) => r.courseId === courseId)
  const course = item?.course

  if (content.isLoading || resources.isLoading) return <DetailSkeleton />
  if (content.isError) {
    const err = content.error as ApiError
    return <ErrorState message={err.message} onRetry={err.status >= 500 || err.status === 0 ? () => content.refetch() : undefined} />
  }
  if (!content.data) return null

  const format = content.data.course.format
  const percent = item ? readingPercent(item) : 0
  const completed = !!item?.courseView?.completedAt || percent === 100

  async function openFile() {
    setOpening(true)
    try {
      // Le fichier arrive sur le téléphone : c'est un téléchargement, et la
      // règle des litiges le compte comme tel (F8.1), exactement comme le
      // bouton « Télécharger » du site.
      await api.post(`me/resources/${courseId}/download`)
      // L'URL signée a pu expirer pendant la lecture de l'écran : on en
      // redemande une juste avant de télécharger.
      const fresh = await api.get<{ url: string }>(`me/resources/${courseId}/content`)
      await downloadAndOpen(fresh.url, content.data?.course.title ?? 'ressource', content.data?.course.contentMimeType)
      void queryClient.invalidateQueries({ queryKey: keys.resources })
    } catch (err) {
      Alert.alert('Ouverture impossible', err instanceof Error ? err.message : 'Réessaie dans un instant.')
    } finally {
      setOpening(false)
    }
  }

  async function markDone() {
    const body = ARCHIVES.includes(format)
      ? { completed: !completed }
      : course?.pageCount ? { lastPage: course.pageCount } : null
    if (!body) return
    try {
      await save.mutateAsync(body)
      void queryClient.invalidateQueries({ queryKey: keys.resources })
    } catch (err) {
      Alert.alert('Enregistrement impossible', err instanceof Error ? err.message : '')
    }
  }

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: formatLabel(format) }} />

      {format === 'video' ? (
        <VideoLesson courseId={courseId} url={content.data.url} startAt={item?.courseView?.watchedSeconds ?? 0} />
      ) : course ? (
        <Cover course={course} height={180} />
      ) : null}

      <View style={{ gap: 8 }}>
        {item?.origin === 'community' && item.community ? (
          <Text variant="caption">Inclus dans {item.community.name}</Text>
        ) : null}
        <Text variant="title">{content.data.course.title}</Text>
        {course ? <Text variant="small">{course.trainerProfile.user.fullName ?? 'Formateur NKAMVA'}{formatDuration(course.durationSeconds) ? ` · ${formatDuration(course.durationSeconds)}` : ''}</Text> : null}
      </View>

      {percent !== null && percent > 0 ? (
        <View style={{ gap: 6 }}>
          <Progress value={percent} />
          <Text variant="caption">{percent} % parcouru</Text>
        </View>
      ) : null}

      {format !== 'video' ? (
        <Card style={styles.panel}>
          <View style={styles.row}>
            <FileText color={colors.brand} size={22} />
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              {format === 'pdf' ? 'Document PDF' : 'Fichiers à télécharger'}
            </Text>
          </View>
          <Text variant="small">
            Le fichier s’ouvre dans la visionneuse de ton téléphone. L’ouvrir compte comme un téléchargement.
          </Text>
          <Button
            label={format === 'pdf' ? 'Ouvrir le document' : 'Télécharger'}
            icon={<Download color="#fff" size={18} />}
            onPress={openFile}
            loading={opening}
          />
          {(ARCHIVES.includes(format) || (format === 'pdf' && course?.pageCount)) ? (
            <Button
              label={completed ? 'Marqué comme terminé' : 'Marquer comme terminé'}
              tone="secondary"
              icon={<CheckCircle2 color={completed ? colors.success : colors.ink} size={18} />}
              onPress={markDone}
              loading={save.isPending}
            />
          ) : null}
        </Card>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  panel: { padding: 16, gap: 12 },
})
