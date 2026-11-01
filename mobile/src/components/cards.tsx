import { Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { Radio, Video } from 'lucide-react-native'
import * as WebBrowser from 'expo-web-browser'
import { API_URL } from '../lib/config'
import { Button } from '../ui/Button'
import { Cover } from '../ui/Cover'
import { Text } from '../ui/Text'
import { Card, Chip, Progress } from '../ui/Bits'
import { colors, radius } from '../ui/theme'
import { formatDateTime, formatDuration, formatLabel } from '../lib/format'
import type { AgendaSession, CourseListItem, ResourceItem } from '../lib/types'

/**
 * Avancement affiché, miroir de `readingPercent` (`src/lib/dto.ts` côté site).
 * `null` veut dire « longueur inconnue », pas zéro.
 */
export function readingPercent(item: ResourceItem): number | null {
  const view = item.courseView
  const course = item.course
  if (!view || !course) return 0
  if (['kit', 'notion', 'tableur'].includes(course.format)) return view.completedAt || view.downloaded ? 100 : 0
  if (course.format === 'video') {
    if (!course.durationSeconds) return view.watchedSeconds > 0 ? null : 0
    return Math.min(100, Math.round((view.watchedSeconds / course.durationSeconds) * 100))
  }
  if (course.format === 'pdf') {
    if (!course.pageCount || !view.lastPage) return view.lastPage ? null : 0
    return Math.min(100, Math.round((view.lastPage / course.pageCount) * 100))
  }
  return 0
}

/** Carte du catalogue. Jamais de prix : l'achat se fait sur le site (docs/application-mobile.md § 3). */
/**
 * Carte compacte du catalogue, pensée pour deux colonnes. Jamais de prix :
 * l'achat se fait sur le site (docs/application-mobile.md § 3).
 */
export function CourseCard({ course, owned, width }: { course: CourseListItem; owned?: boolean; width: number }) {
  const duration = formatDuration(course.durationSeconds)
  return (
    <Card style={{ width, overflow: 'hidden' }} onPress={() => router.push(`/ressource/${course.slug}`)}>
      <View>
        <Cover course={course} height={Math.round(width * 0.62)} rounded={false} />
        <View style={styles.formatTag}><Chip label={formatLabel(course.format)} /></View>
      </View>
      <View style={styles.body}>
        <Text variant="label" numberOfLines={2} style={styles.cardTitle}>{course.title}</Text>
        <Text variant="caption" numberOfLines={1}>
          {course.trainerProfile.user.fullName ?? 'Formateur NKAMVA'}{duration ? ` · ${duration}` : ''}
        </Text>
        {owned ? <Text variant="caption" style={styles.owned}>Dans ta bibliothèque</Text> : null}
      </View>
    </Card>
  )
}

export function ResourceRow({ item }: { item: ResourceItem }) {
  const course = item.course
  if (!course) return null
  const percent = readingPercent(item)
  const suspended = item.accessSuspended
  return (
    <Pressable
      onPress={() => router.push(`/lecteur/${course.id}`)}
      style={({ pressed }) => [styles.resource, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={`Ouvrir ${course.title}`}
    >
      <Cover course={{ ...course }} height={72} style={{ width: 72 }} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="bodyStrong" numberOfLines={2}>{course.title}</Text>
        <Text variant="small" numberOfLines={1}>
          {formatLabel(course.format)} · {course.trainerProfile.user.fullName ?? 'Formateur'}
        </Text>
        {suspended ? (
          <Chip label="Accès suspendu" tone="warn" />
        ) : percent === null ? (
          <Text variant="caption">Commencé</Text>
        ) : (
          <View style={styles.progressRow}>
            <View style={{ flex: 1 }}><Progress value={percent} /></View>
            <Text variant="caption">{percent} %</Text>
          </View>
        )}
      </View>
    </Pressable>
  )
}

/** On peut entrer dans la salle un quart d'heure avant le début. */
const JOIN_WINDOW_MS = 15 * 60 * 1000

/**
 * La vidéo en direct n'est pas encore native (elle demande un build de
 * développement, docs/application-mobile.md § 4). En attendant, la salle
 * s'ouvre dans le navigateur intégré, qui partage la connexion au site.
 */
function joinLive(sessionId: string) {
  void WebBrowser.openBrowserAsync(`${API_URL}/mes-lives/live/${sessionId}`, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
  })
}

export function LiveCard({ session }: { session: AgendaSession }) {
  const live = session.status === 'LIVE' || session.live
  const joinable = live || (session.status === 'SCHEDULED' && new Date(session.startsAt).getTime() - Date.now() < JOIN_WINDOW_MS)
  return (
    <Card style={styles.live}>
      <View style={styles.row}>
        {live ? <Chip label="En direct" tone="live" /> : <Chip label={formatDateTime(session.startsAt)} tone="brand" />}
      </View>
      <Text variant="bodyStrong" numberOfLines={2}>{session.title}</Text>
      <View style={styles.row}>
        <Radio size={16} color={colors.ink3} />
        <Text variant="small" numberOfLines={1} style={{ flex: 1 }}>
          {session.community.name} · {session.host.name} · {session.durationMinutes} min
        </Text>
      </View>
      {joinable ? (
        <Button
          label={live ? 'Rejoindre le live' : 'Entrer dans la salle'}
          icon={<Video size={18} color="#fff" />}
          onPress={() => joinLive(session.id)}
          style={{ marginTop: 4 }}
        />
      ) : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  body: { padding: 10, gap: 4 },
  cardTitle: { fontSize: 14, lineHeight: 19, minHeight: 38 },
  formatTag: { position: 'absolute', left: 8, top: 8 },
  owned: { color: colors.brand, fontFamily: 'InstrumentSans_600SemiBold' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  resource: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  live: { padding: 16, gap: 8 },
})
