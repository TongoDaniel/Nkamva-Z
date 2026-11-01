import { useEffect, useMemo, useState } from 'react'
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import Svg, { Path } from 'react-native-svg'
import { Check, CheckCheck, Megaphone, SendHorizontal } from 'lucide-react-native'
import { api } from '../../lib/api'
import { keys, useConversation, useSendMessage } from '../../lib/queries'
import { Text } from '../../ui/Text'
import { Avatar, CommunityAvatar } from '../../ui/Bits'
import { ErrorState, Loading } from '../../ui/States'
import { colors, fonts } from '../../ui/theme'
import { ChatWallpaper } from '../../components/ChatWallpaper'
import { ReportSheet, type ReportTarget } from '../../components/ReportSheet'
import type { ConversationDetail, Message } from '../../lib/types'

/** Bulles envoyées : un bleu de marque très clair, comme le vert pâle de WhatsApp. */
const MINE_BG = '#dbe7fb'
const THEIRS_BG = '#ffffff'

/** Couleur stable par auteur, pour distinguer les voix d'un groupe. */
const AUTHOR_COLORS = ['#1c5ed0', '#9c4713', '#0d6b4d', '#7d5c05', '#4b3a8c', '#b3402e', '#2b5fa8']
function authorColor(name: string | null): string {
  let h = 0
  for (const ch of name ?? '') h = (h * 31 + ch.charCodeAt(0)) | 0
  return AUTHOR_COLORS[Math.abs(h) % AUTHOR_COLORS.length]
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  if (sameDay(d, today)) return 'Aujourd’hui'
  if (sameDay(d, yesterday)) return 'Hier'
  const label = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function timeLabel(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

type Row =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'message'; key: string; message: Message; first: boolean }

/**
 * Séparateurs de jour et regroupement des messages consécutifs d'un même
 * auteur, le même jour, comme WhatsApp. Calculé dans l'ordre chronologique,
 * puis inversé pour la liste.
 */
function buildRows(messages: Message[]): Row[] {
  const rows: Row[] = []
  messages.forEach((m, i) => {
    const prev = messages[i - 1]
    const newDay = !prev || !sameDay(new Date(prev.createdAt), new Date(m.createdAt))
    if (newDay) rows.push({ kind: 'day', key: `day-${m.id}`, label: dayLabel(m.createdAt) })
    const sameVoice = !!prev && !prev.announcement && !m.announcement && prev.mine === m.mine && prev.authorName === m.authorName
    rows.push({ kind: 'message', key: m.id, message: m, first: newDay || !sameVoice })
  })
  return rows.reverse()
}

/** La pointe de bulle, sur le premier message d'une série. */
function Tail({ mine }: { mine: boolean }) {
  return (
    <Svg width={10} height={14} style={[styles.tail, mine ? { right: -7 } : { left: -7 }]}>
      <Path d={mine ? 'M0 0 H10 L0 14 Z' : 'M10 0 H0 L10 14 Z'} fill={mine ? MINE_BG : THEIRS_BG} />
    </Svg>
  )
}

function Bubble({ m, first, group, onReport }: { m: Message; first: boolean; group: boolean; onReport: () => void }) {
  const read = m.mine && !!m.readAt
  return (
    <View style={[styles.bubbleRow, m.mine ? styles.rowMine : styles.rowTheirs, { marginTop: first ? 8 : 2 }]}>
      {/* Appui long sur le message d'un autre : le signaler. */}
      <Pressable
        onLongPress={!m.mine && !m.deleted ? onReport : undefined}
        delayLongPress={350}
        style={[
          styles.bubble,
          { backgroundColor: m.mine ? MINE_BG : THEIRS_BG },
          first && (m.mine ? { borderTopRightRadius: 0 } : { borderTopLeftRadius: 0 }),
        ]}
      >
        {first ? <Tail mine={m.mine} /> : null}
        {group && !m.mine && first ? (
          <Text variant="label" style={[styles.author, { color: authorColor(m.authorName) }]} numberOfLines={1}>
            {m.authorName}
          </Text>
        ) : null}
        <Text variant="body" style={[styles.body, m.deleted && styles.deleted]}>
          {m.deleted ? 'Message supprimé' : m.body}
          {/* Réserve la place de l'heure au bout de la dernière ligne, comme WhatsApp. */}
          <Text style={styles.metaSpacer}>{m.mine ? ' '.repeat(20) : ' '.repeat(13)}</Text>
        </Text>
        <View style={styles.meta}>
          <Text variant="caption" style={styles.time}>{timeLabel(m.createdAt)}</Text>
          {m.mine ? (read ? <CheckCheck size={14} color={colors.brand} /> : <Check size={14} color={colors.ink3} />) : null}
        </View>
      </Pressable>
    </View>
  )
}

function Announcement({ m }: { m: Message }) {
  return (
    <View style={styles.announcement}>
      <View style={styles.annHead}>
        <Megaphone size={15} color={colors.clay} />
        <Text variant="caption" style={{ color: colors.ink2, fontFamily: fonts.bodySemi }}>Annonce · {m.authorName}</Text>
      </View>
      <Text variant="body" style={{ color: colors.ink, fontSize: 15, lineHeight: 21 }}>{m.deleted ? 'Message supprimé' : m.body}</Text>
      <Text variant="caption" style={styles.annTime}>{timeLabel(m.createdAt)}</Text>
    </View>
  )
}

function HeaderTitle({ c, fallback }: { c?: ConversationDetail; fallback?: string }) {
  const group = c?.kind === 'GROUP'
  const subtitle = !c ? '' : group ? 'Groupe de la communauté' : c.communityName
  return (
    <View style={styles.header}>
      {group ? (
        <CommunityAvatar name={c?.title ?? fallback ?? ''} size={36} />
      ) : (
        <Avatar name={c?.peer?.name ?? c?.title ?? fallback ?? null} size={36} />
      )}
      <View style={{ flexShrink: 1 }}>
        <Text variant="bodyStrong" numberOfLines={1} style={{ fontSize: 16 }}>{c?.title ?? fallback ?? ''}</Text>
        {subtitle ? <Text variant="caption" numberOfLines={1}>{subtitle}</Text> : null}
      </View>
    </View>
  )
}

export default function Conversation() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>()
  const queryClient = useQueryClient()
  const conversation = useConversation(id)
  const send = useSendMessage(id)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<ReportTarget | null>(null)

  const c = conversation.data
  const rows = useMemo(() => buildRows(c?.messages ?? []), [c?.messages])

  // Accusé de lecture explicite (PATCH), comme le site : à l'ouverture du fil
  // et à chaque nouveau message reçu pendant qu'il est affiché. La pastille de
  // l'onglet suit sans attendre le prochain rafraîchissement.
  const lastId = c?.messages.at(-1)?.id
  useEffect(() => {
    if (!lastId) return
    api.patch(`me/conversations/${id}`)
      .then(() => queryClient.invalidateQueries({ queryKey: keys.conversations }))
      .catch(() => {})
  }, [id, lastId, queryClient])

  async function submit() {
    const body = draft.trim()
    if (!body || send.isPending) return
    setError(null)
    try {
      await send.mutateAsync(body)
      setDraft('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Envoi impossible.')
    }
  }

  const canSend = !!draft.trim() && !send.isPending

  return (
    <SafeAreaView edges={['bottom']} style={styles.fill}>
      <Stack.Screen
        options={{
          headerTitle: () => <HeaderTitle c={c} fallback={title} />,
          headerTitleAlign: 'left',
        }}
      />
      <ChatWallpaper />
      <ReportSheet target={report} onClose={() => setReport(null)} />
      {conversation.isLoading ? (
        <Loading />
      ) : conversation.isError ? (
        <ErrorState message={(conversation.error as Error).message} onRetry={() => conversation.refetch()} />
      ) : (
        <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
          {/* Liste inversée, le modèle des messageries : elle s'ouvre sur le
              dernier message et garde la position quand le clavier monte. */}
          <FlatList
            inverted
            data={rows}
            keyExtractor={(r) => r.key}
            contentContainerStyle={styles.list}
            renderItem={({ item }) =>
              item.kind === 'day' ? (
                <View style={styles.dayWrap}><View style={styles.day}><Text variant="caption" style={styles.dayText}>{item.label}</Text></View></View>
              ) : item.message.announcement ? (
                <Announcement m={item.message} />
              ) : (
                <Bubble
                  m={item.message}
                  first={item.first}
                  group={c?.kind === 'GROUP'}
                  onReport={() => setReport({ type: 'MESSAGE', id: item.message.id, label: 'ce message' })}
                />
              )
            }
            ListEmptyComponent={
              <View style={[styles.dayWrap, styles.emptyFlip]}>
                <View style={styles.day}><Text variant="caption" style={styles.dayText}>Écris le premier message.</Text></View>
              </View>
            }
          />
          {c?.canWrite ? (
            <View style={styles.composerWrap}>
              {error ? <Text variant="small" style={styles.error}>{error}</Text> : null}
              <View style={styles.composer}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Message"
                  placeholderTextColor={colors.hairline}
                  style={styles.input}
                  multiline
                  maxLength={4000}
                />
                <Pressable
                  onPress={submit}
                  disabled={!canSend}
                  style={[styles.send, !canSend && { opacity: 0.45 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Envoyer"
                >
                  <SendHorizontal color="#fff" size={20} />
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.readonly}>
              <Text variant="small" style={{ textAlign: 'center' }}>{c?.readOnlyReason ?? 'Ce fil est en lecture seule.'}</Text>
            </View>
          )}
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 260 },
  list: { paddingHorizontal: 12, paddingVertical: 10 },
  dayWrap: { alignItems: 'center', marginVertical: 10 },
  day: {
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  dayText: { color: colors.ink2, fontFamily: fonts.bodySemi, letterSpacing: 0 },
  bubbleRow: { flexDirection: 'row', paddingHorizontal: 8 },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 6,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 1.5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  tail: { position: 'absolute', top: 0 },
  author: { fontSize: 13, marginBottom: 2 },
  body: { color: colors.ink, fontSize: 15.5, lineHeight: 21 },
  deleted: { fontStyle: 'italic', color: colors.ink3 },
  metaSpacer: { color: 'transparent', fontSize: 12 },
  meta: { position: 'absolute', right: 8, bottom: 4, flexDirection: 'row', alignItems: 'center', gap: 3 },
  time: { fontSize: 11, color: colors.ink3, letterSpacing: 0 },
  // Bulle blanche centrée, comme une annonce de communauté WhatsApp : pas de
  // texte orange sur fond orange pâle. Seule l'icône porte la couleur.
  announcement: { alignSelf: 'center', width: '92%', backgroundColor: colors.card, borderRadius: 12, padding: 12, gap: 6, marginVertical: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  annHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  annTime: { alignSelf: 'flex-end', fontSize: 11, letterSpacing: 0 },
  composerWrap: { paddingHorizontal: 8, paddingTop: 6, paddingBottom: 8 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 46,
    backgroundColor: colors.card,
    borderRadius: 23,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  send: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  // La liste inversée retourne aussi son état vide : sur un seul axe sur iOS,
  // sur les deux sur Android. On le remet à l'endroit.
  emptyFlip: { transform: Platform.OS === 'android' ? [{ rotate: '180deg' }] : [{ scaleY: -1 }] },
  readonly: { padding: 16, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.line2 },
  error: { color: colors.danger, paddingHorizontal: 10, paddingBottom: 6 },
})
