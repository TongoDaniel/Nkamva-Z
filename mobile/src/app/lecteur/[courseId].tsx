import { useState } from 'react'
import { Alert, StyleSheet, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { BookOpen, CheckCircle2, Download, PauseCircle } from 'lucide-react-native'
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
      <Bone height={180} style={{ borderRadius: 16 }} />
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
    // Un litige n'est pas une panne : son propre titre, sa propre icône.
    if (err.code === 'ACCESS_SUSPENDED') {
      return (
        <ErrorState
          icon={<PauseCircle color={colors.ink3} size={40} strokeWidth={1.5} />}
          title="Accès suspendu"
          message="Un litige est en cours sur cette ressource. Tu retrouveras l’accès dès sa résolution."
        />
      )
    }
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
        <VideoLesson
          courseId={courseId}
          url={content.data.url}
          startAt={item?.courseView?.watchedSeconds ?? 0}
          poster={course ? <Cover course={course} rounded={false} mark={false} style={styles.poster} /> : undefined}
        />
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

      {/* Les actions d'abord, l'explication en note dessous, comme sous un
          bouton des Réglages iOS. Plus de carte avec pictogramme bleu. */}
      {format !== 'video' ? (
        <View style={{ gap: 10 }}>
          <Button
            label={format === 'pdf' ? 'Ouvrir le document' : 'Télécharger les fichiers'}
            icon={format === 'pdf' ? <BookOpen color="#fff" size={18} /> : <Download color="#fff" size={18} />}
            onPress={openFile}
            loading={opening}
          />
          {(ARCHIVES.includes(format) || (format === 'pdf' && course?.pageCount)) ? (
            <Button
              label={completed ? 'Terminé' : 'Marquer comme terminé'}
              tone="secondary"
              icon={<CheckCircle2 color={completed ? colors.success : colors.ink} size={18} />}
              onPress={markDone}
              loading={save.isPending}
            />
          ) : null}
          <Text variant="caption" style={{ paddingHorizontal: 4 }}>
            {format === 'pdf'
              ? 'Le document s’ouvre dans la visionneuse de ton téléphone. L’ouvrir compte comme un téléchargement.'
              : 'Les fichiers s’ouvrent avec l’application adaptée de ton téléphone. Les ouvrir compte comme un téléchargement.'}
          </Text>
        </View>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  poster: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, height: '100%' },
})
