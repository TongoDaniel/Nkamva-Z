import { useEffect, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import { useVideoPlayer, VideoView } from 'expo-video'
import { useSaveProgress } from '../lib/queries'

/** Une position est envoyée au serveur au plus toutes les 15 secondes. */
const SAVE_EVERY_SECONDS = 15

/**
 * Lecture native avec reprise. La position vit côté serveur (`courseView`),
 * comme sur le site : changer de téléphone ne fait pas perdre sa place.
 */
export function VideoLesson({ courseId, url, startAt }: { courseId: string; url: string; startAt: number }) {
  const save = useSaveProgress(courseId)
  const lastSaved = useRef(startAt)

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
    </View>
  )
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', borderRadius: 16, overflow: 'hidden' },
})
