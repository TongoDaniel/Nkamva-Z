import { useState } from 'react'
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { CalendarDays, Clock } from 'lucide-react-native'
import { ApiError } from '../../lib/api'
import { formatDateTime } from '../../lib/format'
import { useScheduleLive, useTrainerCommunity } from '../../lib/studio'
import { Screen } from '../../ui/Screen'
import { Text } from '../../ui/Text'
import { Field } from '../../ui/Field'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Bits'
import { ErrorState } from '../../ui/States'
import { Bone } from '../../ui/Skeleton'
import { colors, radius } from '../../ui/theme'
import { openTrainerPage } from '../../components/studio'

const DURATIONS = [30, 45, 60, 90, 120]

/** Demain à 18 h : l'heure la plus courante d'une séance après le travail. */
function defaultStart() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(18, 0, 0, 0)
  return d
}

/**
 * Ligne date ou heure, comme dans la création d'évènement de Google Agenda :
 * sur Android, un toucher ouvre le sélecteur du système ; sur iOS, le
 * sélecteur compact du système s'affiche directement dans la ligne.
 */
function PickerRow({ mode, value, onChange }: { mode: 'date' | 'time'; value: Date; onChange: (d: Date) => void }) {
  const Icon = mode === 'date' ? CalendarDays : Clock
  const label = mode === 'date'
    ? value.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    : `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`

  const handle = (_event: unknown, date: Date) => onChange(date)

  return (
    <Pressable
      style={styles.pickerRow}
      disabled={Platform.OS === 'ios'}
      onPress={() => DateTimePickerAndroid.open({ value, mode, is24Hour: true, minimumDate: mode === 'date' ? new Date() : undefined, onValueChange: handle })}
      accessibilityRole="button"
      accessibilityLabel={mode === 'date' ? `Date : ${label}` : `Heure : ${label}`}
    >
      <Icon size={20} color={colors.ink2} />
      {Platform.OS === 'ios' ? (
        <>
          <Text variant="body" style={{ flex: 1, color: colors.ink }}>{mode === 'date' ? 'Date' : 'Heure'}</Text>
          <DateTimePicker value={value} mode={mode} display="compact" locale="fr-FR" minimumDate={mode === 'date' ? new Date() : undefined} onValueChange={handle} />
        </>
      ) : (
        <Text variant="body" style={{ flex: 1, color: colors.ink }}>{label}</Text>
      )}
    </Pressable>
  )
}

export default function ProgrammerLive() {
  const community = useTrainerCommunity()
  const schedule = useScheduleLive()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [start, setStart] = useState(defaultStart)
  const [duration, setDuration] = useState(60)
  const [error, setError] = useState<string | null>(null)

  if (community.isLoading) {
    return <Screen edges={['bottom']}><Bone height={52} /><Bone height={110} /><Bone height={52} round /></Screen>
  }
  if (community.isError) return <ErrorState message={(community.error as Error).message} onRetry={() => community.refetch()} />
  const c = community.data
  if (!c) {
    return (
      <Screen edges={['bottom']}>
        <Text variant="heading">Il te faut d’abord une communauté</Text>
        <Text variant="body">Les lives se tiennent dans ta communauté. Ouvre-la depuis le site, puis reviens programmer ta première séance.</Text>
        <Button label="Ouvrir ma communauté sur le site" onPress={() => openTrainerPage('/formateur/communaute')} />
      </Screen>
    )
  }
  if (!c.eventsEnabled) {
    return (
      <Screen edges={['bottom']}>
        <Text variant="heading">Les lives sont désactivés</Text>
        <Text variant="body">Active les lives dans les réglages de {c.name} sur le site pour pouvoir en programmer.</Text>
        <Button label="Réglages de la communauté" onPress={() => openTrainerPage('/formateur/communaute')} />
      </Screen>
    )
  }

  // La date et l'heure sont choisies séparément : chacune ne change que sa part.
  const setDay = (d: Date) => setStart((prev) => { const n = new Date(d); n.setHours(prev.getHours(), prev.getMinutes(), 0, 0); return n })
  const setTime = (d: Date) => setStart((prev) => { const n = new Date(prev); n.setHours(d.getHours(), d.getMinutes(), 0, 0); return n })

  function submit() {
    if (!title.trim()) { setError('Donne un titre à ton live.'); return }
    if (start.getTime() < Date.now() + 5 * 60 * 1000) { setError('Choisis un horaire à venir.'); return }
    setError(null)
    schedule.mutate(
      {
        communityId: c!.id,
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        scheduledStartAt: start.toISOString(),
        durationMinutes: duration,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      {
        onSuccess: () => {
          router.back()
          Alert.alert('Live programmé', `${formatDateTime(start.toISOString())}. Les membres de ${c!.name} le verront dans leur agenda.`)
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : 'Programmation impossible.'),
      },
    )
  }

  return (
    <Screen keyboard edges={['bottom']}>
      <Text variant="small">Dans {c.name}</Text>
      <Field label="Titre" value={title} onChangeText={setTitle} maxLength={160} placeholder="Questions ouvertes du mois" />
      <Field
        label="Description"
        hint="Facultatif. Ce dont vous allez parler."
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={2000}
        style={{ minHeight: 88, textAlignVertical: 'top', paddingTop: 14 }}
      />

      <View style={{ gap: 6 }}>
        <Text variant="label">Quand</Text>
        <Card style={{ overflow: 'hidden' }}>
          <PickerRow mode="date" value={start} onChange={setDay} />
          <View style={styles.sep} />
          <PickerRow mode="time" value={start} onChange={setTime} />
        </Card>
      </View>

      <View style={{ gap: 8 }}>
        <Text variant="label">Durée</Text>
        <View style={styles.durations}>
          {DURATIONS.map((d) => {
            const active = d === duration
            return (
              <Pressable
                key={d}
                onPress={() => setDuration(d)}
                style={[styles.duration, active && styles.durationActive]}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <Text variant="label" style={{ color: active ? '#fff' : colors.ink2 }}>{d < 60 ? `${d} min` : `${Math.floor(d / 60)} h${d % 60 ? ` ${d % 60}` : ''}`}</Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      {error ? <Text variant="small" style={{ color: colors.danger }}>{error}</Text> : null}
      <Button label="Programmer" onPress={submit} loading={schedule.isPending} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 56 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: 50 },
  durations: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  duration: { paddingHorizontal: 14, height: 36, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line },
  durationActive: { backgroundColor: colors.navy, borderColor: colors.navy },
})
