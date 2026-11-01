import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Check } from 'lucide-react-native'
import { api, ApiError } from '../lib/api'
import { Text } from '../ui/Text'
import { Button } from '../ui/Button'
import { colors, fonts, radius } from '../ui/theme'

export type ReportTarget = {
  type: 'COURSE' | 'USER' | 'COMMUNITY' | 'MESSAGE'
  id: string
  /** Ce qu'on signale, en clair : « ce message », « cette ressource ». */
  label: string
}

/** Mêmes motifs et mêmes mots que le site (`src/lib/report-labels.ts`). */
const REASONS: Array<{ value: string; label: string }> = [
  { value: 'HARASSMENT', label: 'Harcèlement' },
  { value: 'SPAM', label: 'Spam' },
  { value: 'MISLEADING', label: 'Contenu trompeur' },
  { value: 'ILLEGAL', label: 'Contenu illégal' },
  { value: 'INTELLECTUAL_PROPERTY', label: 'Propriété intellectuelle' },
  { value: 'OTHER', label: 'Autre' },
]

/**
 * Feuille de signalement. Les stores l'exigent de toute app où des personnes
 * publient du contenu (messages, groupes) : signaler doit être possible en
 * quelques gestes, depuis le contenu lui-même. Le signalement part dans la
 * file de modération du site (`POST /api/reports`).
 */
export function ReportSheet({ target, onClose }: { target: ReportTarget | null; onClose: () => void }) {
  const insets = useSafeAreaInsets()
  const [reason, setReason] = useState<string | null>(null)
  const [detail, setDetail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (target) { setReason(null); setDetail(''); setError(null); setSent(false) }
  }, [target])

  async function submit() {
    if (!target || !reason) return
    setSending(true)
    setError(null)
    try {
      await api.post('reports', { targetType: target.type, targetId: target.id, reason, ...(detail.trim() ? { detail: detail.trim() } : {}) })
      setSent(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Envoi impossible.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal visible={!!target} transparent statusBarTranslucent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          {sent ? (
            <View style={{ gap: 10 }}>
              <Text variant="heading">Merci, c’est transmis</Text>
              <Text variant="body">L’équipe de modération va examiner {target?.label}. Tu ne verras pas de réponse ici, mais chaque signalement est lu.</Text>
              <Button label="Fermer" onPress={onClose} />
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              <Text variant="heading">Signaler {target?.label}</Text>
              <View style={styles.reasons}>
                {REASONS.map((r) => {
                  const active = reason === r.value
                  return (
                    <Pressable
                      key={r.value}
                      onPress={() => setReason(r.value)}
                      style={styles.reason}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                    >
                      <Text variant="body" style={{ flex: 1, color: colors.ink }}>{r.label}</Text>
                      {/* La coche seule, comme une liste de choix iOS. */}
                      {active ? <Check size={20} color={colors.brand} /> : null}
                    </Pressable>
                  )
                })}
              </View>
              <TextInput
                value={detail}
                onChangeText={setDetail}
                placeholder="Ajouter une précision (facultatif)"
                placeholderTextColor={colors.hairline}
                multiline
                maxLength={2000}
                style={styles.detail}
              />
              {error ? <Text variant="small" style={{ color: colors.danger }}>{error}</Text> : null}
              <Button label="Envoyer le signalement" tone="danger" disabled={!reason} loading={sending} onPress={submit} />
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(21,33,27,0.35)' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: 20, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, marginBottom: 14 },
  reasons: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.line2, overflow: 'hidden' },
  reason: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  detail: { minHeight: 72, maxHeight: 140, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 12, fontFamily: fonts.body, fontSize: 16, color: colors.ink, textAlignVertical: 'top' },
})
