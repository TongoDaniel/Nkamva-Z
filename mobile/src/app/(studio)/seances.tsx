import { useState } from 'react'
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Plus, Radio } from 'lucide-react-native'
import { ApiError } from '../../lib/api'
import { useCancelLive, useTrainerSessions } from '../../lib/studio'
import type { AgendaSession } from '../../lib/types'
import { Text } from '../../ui/Text'
import { Button } from '../../ui/Button'
import { Card, Chip } from '../../ui/Bits'
import { EmptyState, ErrorState } from '../../ui/States'
import { LiveCardSkeleton, Repeat } from '../../ui/Skeleton'
import { colors, radius } from '../../ui/theme'
import { isUpcoming } from '../../components/cards'
import { openTrainerPage } from '../../components/studio'

const MONTHS = ['JANV.', 'FÉVR.', 'MARS', 'AVR.', 'MAI', 'JUIN', 'JUIL.', 'AOÛT', 'SEPT.', 'OCT.', 'NOV.', 'DÉC.']

/** « Aujourd’hui, 17:00 », « Demain, 17:00 », sinon l'heure seule : le jour est dans le pavé. */
function when(d: Date) {
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000)
  return days === 0 ? `Aujourd’hui, ${time}` : days === 1 ? `Demain, ${time}` : time
}

/**
 * Une séance vue par son animateur, comme un évènement que l'on gère dans
 * Luma : la date en pavé, l'état, et les actions. La salle (lancer, animer,
 * partager l'écran) s'ouvre dans le navigateur tant que la vidéo native
 * n'est pas là.
 */
function SessionCard({ session }: { session: AgendaSession }) {
  const cancel = useCancelLive()
  const start = new Date(session.startsAt)
  const live = session.status === 'LIVE' || session.live
  const upcoming = isUpcoming(session)
  const soon = start.getTime() - Date.now() < 15 * 60 * 1000
  const state =
    session.status === 'CANCELED' ? 'Annulée'
      : session.status === 'ENDED' ? `Terminée · ${session.attendees} participant${session.attendees > 1 ? 's' : ''}`
        : null

  function confirmCancel() {
    Alert.alert('Annuler ce live ?', 'Les membres de ta communauté seront prévenus.', [
      { text: 'Garder', style: 'cancel' },
      {
        text: 'Annuler le live',
        style: 'destructive',
        onPress: () => cancel.mutate(session.id, {
          onError: (err) => Alert.alert('Annulation impossible', err instanceof ApiError ? err.message : ''),
        }),
      },
    ])
  }

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <View style={styles.date}>
          <Text variant="caption" style={styles.month}>{MONTHS[start.getMonth()]}</Text>
          <Text variant="heading" style={styles.day}>{start.getDate()}</Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          {live ? <Chip label="EN DIRECT" tone="live" /> : null}
          <Text variant="bodyStrong" numberOfLines={2}>{session.title}</Text>
          <Text variant="small" numberOfLines={1}>{when(start)} · {session.durationMinutes} min</Text>
          {state ? <Text variant="caption">{state}</Text> : null}
        </View>
      </View>
      {upcoming ? (
        <View style={styles.actions}>
          {/* Bouton principal seulement à l'approche du début, comme côté
              apprenant ; avant, la salle s'ouvre pour la préparer. */}
          <Button
            label={live ? 'Rejoindre la salle' : soon ? 'Lancer le live' : 'Ouvrir la salle'}
            tone={live || soon ? 'primary' : 'secondary'}
            style={{ flex: 1 }}
            onPress={() => openTrainerPage(`/formateur/lives/${session.id}/console`)}
          />
          {!live ? <Button label="Annuler" tone="danger" onPress={confirmCancel} loading={cancel.isPending} /> : null}
        </View>
      ) : null}
    </Card>
  )
}

export default function Seances() {
  const sessions = useTrainerSessions()
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const all = sessions.data ?? []
  const items = tab === 'upcoming'
    ? all.filter(isUpcoming).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    : all.filter((s) => !isUpcoming(s)).sort((a, b) => b.startsAt.localeCompare(a.startsAt))

  return (
    <SafeAreaView edges={['top']} style={styles.fill}>
      <View style={styles.top}>
        <View style={styles.titleRow}>
          <Text variant="title" style={{ flex: 1 }}>Lives</Text>
          <Pressable onPress={() => router.push('/studio/programmer-live')} style={styles.add} hitSlop={8} accessibilityRole="button" accessibilityLabel="Programmer un live">
            <Plus size={22} color={colors.ink} />
          </Pressable>
        </View>
        <View style={styles.segment}>
          {([['upcoming', 'À venir'], ['past', 'Passés']] as const).map(([key, label]) => (
            <Pressable key={key} onPress={() => setTab(key)} style={[styles.segmentItem, tab === key && styles.segmentActive]} accessibilityRole="button" accessibilityState={{ selected: tab === key }}>
              <Text variant="label" style={{ color: tab === key ? colors.ink : colors.ink3 }}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {sessions.isLoading ? (
        <View style={styles.list}><Repeat count={3}><LiveCardSkeleton /></Repeat></View>
      ) : sessions.isError ? (
        <ErrorState message={(sessions.error as Error).message} onRetry={() => sessions.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(s) => s.id}
          contentContainerStyle={[styles.list, { gap: 12 }]}
          refreshing={sessions.isRefetching}
          onRefresh={() => sessions.refetch()}
          renderItem={({ item }) => <SessionCard session={item} />}
          ListEmptyComponent={
            tab === 'upcoming' ? (
              <EmptyState
                icon={<Radio color={colors.ink3} size={40} strokeWidth={1.5} />}
                title="Aucun live programmé"
                body="Programme une séance : les membres de ta communauté la verront dans leur agenda."
                action={<Button label="Programmer un live" tone="secondary" onPress={() => router.push('/studio/programmer-live')} />}
              />
            ) : (
              <EmptyState title="Aucun live passé" />
            )
          }
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
  top: { paddingHorizontal: 20, paddingTop: 20, gap: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  add: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  segment: { flexDirection: 'row', backgroundColor: colors.line2, borderRadius: radius.sm, padding: 3 },
  segmentItem: { flex: 1, minHeight: 34, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm - 2 },
  segmentActive: { backgroundColor: colors.card, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
  list: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  card: { padding: 14, gap: 12 },
  head: { flexDirection: 'row', gap: 14 },
  date: { width: 52, paddingVertical: 6, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, alignItems: 'center', alignSelf: 'flex-start' },
  month: { color: colors.clay, fontFamily: 'InstrumentSans_700Bold', fontSize: 11, lineHeight: 14 },
  day: { fontSize: 22, lineHeight: 26 },
  actions: { flexDirection: 'row', gap: 10 },
})
