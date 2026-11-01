import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Play } from 'lucide-react-native'
import { Text } from '../ui/Text'
import { useVideoPlayer, VideoView } from 'expo-video'
import { useSaveProgress } from '../lib/queries'
import { colors } from '../ui/theme'

/** Une position est envoyée au serveur au plus toutes les 15 secondes. */
const SAVE_EVERY_SECONDS = 15

/**
 * Lecture native avec reprise. La position vit côté serveur (`courseView`),
 * comme sur le site : changer de téléphone ne fait pas perdre sa place.
 */
function clock(seconds: number): string {
  const s = Math.floor(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function VideoLesson({ courseId, url, startAt, poster }: { courseId: string; url: string; startAt: number; poster?: ReactNode }) {
  const save = useSaveProgress(courseId)
  const lastSaved = useRef(startAt)
  // Avant la première lecture, une vignette et un gros bouton, comme sur
  // YouTube, plutôt qu'un rectangle noir dont les commandes n'apparaissent
  // qu'au toucher.
  const [started, setStarted] = useState(false)

  const player = useVideoPlayer(url, (p) => {
    p.timeUpdateEventInterval = 1
    if (startAt > 5) p.currentTime = startAt
  })

  useEffect(() => {
    const persist = (seconds: number) => {
      const s = Math.floor(seconds)
      if (s <= lastSaved.current) return
      lastSaved.current = s
      save.mutate({ watchedSeconds: s })
    }
    const sub = player.addListener('timeUpdate', ({ currentTime }) => {
      if (currentTime - lastSaved.current >= SAVE_EVERY_SECONDS) persist(currentTime)
    })
    const end = player.addListener('playToEnd', () => persist(player.duration))
    return () => {
      sub.remove()
      end.remove()
      // En quittant l'écran : la dernière position, pas celle d'il y a 15 s.
      persist(player.currentTime)
    }
    // `save.mutate` est stable ; le reste ne change pas pendant la vie de l'écran.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player])

  return (
    <View style={styles.frame}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        nativeControls
        contentFit="contain"
        allowsPictureInPicture
        fullscreenOptions={{ enable: true }}
      />
      {started ? null : (
        <Pressable
          style={styles.poster}
          onPress={() => { setStarted(true); player.play() }}
          accessibilityRole="button"
          accessibilityLabel={startAt > 5 ? `Reprendre à ${clock(startAt)}` : 'Lire la vidéo'}
        >
          {poster}
          <View style={styles.shade} />
          <View style={styles.play}><Play size={28} color={colors.ink} fill={colors.ink} style={{ marginLeft: 3 }} /></View>
          {startAt > 5 ? <Text variant="label" style={styles.resume}>Reprendre à {clock(startAt)}</Text> : null}
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', borderRadius: 16, overflow: 'hidden' },
  poster: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 10 },
  shade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.25)' },
  play: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  resume: { color: '#fff' },
})
