import { memo } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { CheckCircle2, PauseCircle, Video } from 'lucide-react-native'
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

/**
 * Carte compacte du catalogue, pensée pour deux colonnes. Jamais de prix :
 * l'achat se fait sur le site (docs/application-mobile.md § 3).
 */
export const CourseCard = memo(function CourseCard({ course, owned, width }: { course: CourseListItem; owned?: boolean; width: number }) {
  const duration = formatDuration(course.durationSeconds)
  return (
    <Card style={{ width, overflow: 'hidden' }} onPress={() => router.push(`/ressource/${course.slug}`)}>
      <Cover course={course} height={Math.round(width * 0.62)} rounded={false} />
      <View style={styles.body}>
        {/* Le format s'écrit au-dessus du titre, comme la mention de collection
            d'un livre : plus d'étiquette posée sur la couverture. */}
        <Text variant="caption" numberOfLines={1} style={styles.kicker}>
          {formatLabel(course.format)}{duration ? ` · ${duration}` : ''}
        </Text>
        <Text variant="label" numberOfLines={2} style={styles.cardTitle}>{course.title}</Text>
        <Text variant="caption" numberOfLines={1}>{course.trainerProfile.user.fullName ?? 'Formateur NKAMVA'}</Text>
        {owned ? <Text variant="caption" style={styles.owned}>Dans ta bibliothèque</Text> : null}
      </View>
    </Card>
  )
})

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
      <Cover course={course} height={64} style={{ width: 64 }} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="bodyStrong" numberOfLines={2}>{course.title}</Text>
        <Text variant="small" numberOfLines={1}>
          {formatLabel(course.format)} · {course.trainerProfile.user.fullName ?? 'Formateur'}
        </Text>
        {suspended ? (
          <View style={styles.row}>
            <PauseCircle size={14} color={colors.goldInk} />
            <Text variant="caption" style={{ color: colors.goldInk }}>Accès suspendu</Text>
          </View>
        ) : percent === null ? (
          <Text variant="caption">Commencé</Text>
        ) : percent === 0 ? (
          // Comme Apple Books : pas de barre vide à 0 %, une mention.
          <Text variant="caption">Pas encore commencé</Text>
        ) : percent === 100 ? (
          <View style={styles.row}>
            <CheckCircle2 size={14} color={colors.success} />
            <Text variant="caption" style={{ color: colors.success }}>Terminé</Text>
          </View>
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
 * À afficher dans « Prochains lives » : en cours, ou programmé et pas encore
 * terminé. Une séance programmée dont l'heure de fin est passée sans qu'elle
 * ait démarré n'a plus rien à proposer.
 */
export function isUpcoming(session: Pick<AgendaSession, 'status' | 'live' | 'startsAt' | 'durationMinutes'>): boolean {
  if (session.status === 'LIVE' || session.live) return true
  if (session.status !== 'SCHEDULED') return false
  return new Date(session.startsAt).getTime() + session.durationMinutes * 60 * 1000 > Date.now()
}

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

const MONTHS = ['JANV.', 'FÉVR.', 'MARS', 'AVR.', 'MAI', 'JUIN', 'JUIL.', 'AOÛT', 'SEPT.', 'OCT.', 'NOV.', 'DÉC.']

/**
 * Carte d'un live, sur le modèle d'un évènement Luma ou Google Agenda : la
 * date en pavé à gauche (mois, jour), l'heure dans la ligne d'infos. Plus de
 * pastille bleue sur fond bleu pâle.
 */
export function LiveCard({ session }: { session: AgendaSession }) {
  const live = session.status === 'LIVE' || session.live
  const joinable = live || (session.status === 'SCHEDULED' && new Date(session.startsAt).getTime() - Date.now() < JOIN_WINDOW_MS)
  const start = new Date(session.startsAt)
  const time = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`
  const days = Math.round((new Date(start).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000)
  const when = days === 0 ? `Aujourd’hui, ${time}` : days === 1 ? `Demain, ${time}` : time
  return (
    <Card style={styles.live}>
      <View style={styles.liveHead}>
        <View style={styles.dateBlock} accessibilityLabel={formatDateTime(session.startsAt)}>
          <Text variant="caption" style={styles.month}>{MONTHS[start.getMonth()]}</Text>
          <Text variant="heading" style={styles.day}>{start.getDate()}</Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          {live ? <Chip label="EN DIRECT" tone="live" /> : null}
          <Text variant="bodyStrong" numberOfLines={2}>{session.title}</Text>
          <Text variant="small" numberOfLines={1}>
            {live ? 'Maintenant' : when} · {session.durationMinutes} min · {session.community.name}
          </Text>
        </View>
      </View>
      {joinable ? (
        <Button
          label={live ? 'Rejoindre le live' : 'Entrer dans la salle'}
          icon={<Video size={18} color="#fff" />}
          onPress={() => joinLive(session.id)}
        />
      ) : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  body: { padding: 10, gap: 3 },
  kicker: { color: colors.ink3 },
  cardTitle: { fontSize: 14, lineHeight: 19, minHeight: 38 },
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
  live: { padding: 14, gap: 12 },
  liveHead: { flexDirection: 'row', gap: 14 },
  dateBlock: {
    width: 52,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  month: { color: colors.clay, fontFamily: 'InstrumentSans_700Bold', fontSize: 11, lineHeight: 14 },
  day: { fontSize: 22, lineHeight: 26 },
})
