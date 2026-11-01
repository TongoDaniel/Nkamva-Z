import { useState } from 'react'
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Info } from 'lucide-react-native'
import { usePreventScreenCapture } from 'expo-screen-capture'
import { ApiError } from '../../lib/api'
import { formatFcfa } from '../../lib/format'
import { usePayouts, useRequestPayout, useTrainerOverview, type TrainerOverview } from '../../lib/studio'
import { Screen } from '../../ui/Screen'
import { Text } from '../../ui/Text'
import { Button } from '../../ui/Button'
import { Divider, SectionTitle } from '../../ui/Bits'
import { ErrorState } from '../../ui/States'
import { Bone } from '../../ui/Skeleton'
import { colors, fonts, radius } from '../../ui/theme'
import { openTrainerPage, PayoutRow } from '../../components/studio'

const BLOCKED: Record<NonNullable<TrainerOverview['payout']['blockedBy']>, string> = {
  PAYOUT_METHOD_MISSING: 'Ajoute un moyen de paiement (Mobile Money ou compte bancaire) pour pouvoir retirer.',
  PAYOUT_METHOD_NOT_VERIFIED: 'Ton moyen de paiement est en cours de vérification par l’équipe NKAMVA.',
  PAYOUT_METHOD_CARENCE: 'Ton moyen de paiement vient d’être ajouté : un délai de sécurité de 72 h s’applique avant le premier retrait.',
}

/**
 * Saisie du montant, sur le modèle du virement vers la banque de Stripe :
 * le montant en grand, « Tout retirer » à portée, et une confirmation avant
 * l'envoi. Le serveur revérifie tout (minimum, solde, moyen de paiement).
 */
function WithdrawSheet({ visible, max, min, onClose }: { visible: boolean; max: number; min: number; onClose: () => void }) {
  const insets = useSafeAreaInsets()
  const request = useRequestPayout()
  const [raw, setRaw] = useState(String(max))
  const [error, setError] = useState<string | null>(null)
  const amount = Number(raw.replace(/\D/g, '')) || 0

  function submit() {
    if (amount < min) { setError(`Le minimum est de ${formatFcfa(min)}.`); return }
    if (amount > max) { setError(`Tu peux retirer au plus ${formatFcfa(max)}.`); return }
    setError(null)
    Alert.alert('Confirmer le retrait', `${formatFcfa(amount)} vers ton moyen de paiement enregistré.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        onPress: () => {
          request.mutate(amount, {
            onSuccess: () => {
              onClose()
              Alert.alert('Demande envoyée', 'Tu peux suivre ton retrait dans l’historique ci-dessous.')
            },
            onError: (err) => setError(err instanceof ApiError ? err.message : 'Envoi impossible.'),
          })
        },
      },
    ])
  }

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="slide" onRequestClose={onClose} onShow={() => { setRaw(String(max)); setError(null) }}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          <Text variant="heading">Retirer</Text>
          <View style={styles.amountRow}>
            <TextInput
              value={raw}
              onChangeText={(v) => setRaw(v.replace(/\D/g, ''))}
              keyboardType="number-pad"
              style={styles.amountInput}
              accessibilityLabel="Montant à retirer en FCFA"
              autoFocus
            />
            <Text variant="heading" style={{ color: colors.ink3 }}>FCFA</Text>
          </View>
          <View style={styles.quick}>
            <Text variant="caption">Disponible : {formatFcfa(max)}</Text>
            <Pressable onPress={() => setRaw(String(max))} hitSlop={8} accessibilityRole="button">
              <Text variant="label" style={{ color: colors.brand }}>Tout retirer</Text>
            </Pressable>
          </View>
          {error ? <Text variant="small" style={{ color: colors.danger }}>{error}</Text> : null}
          <Button label="Continuer" onPress={submit} loading={request.isPending} disabled={!amount} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

export default function Portefeuille() {
  // Comme dans une app bancaire : ni capture d'écran ni aperçu dans le
  // sélecteur d'apps pour l'écran qui montre l'argent et permet de le retirer.
  usePreventScreenCapture('portefeuille')
  const panel = useTrainerOverview()
  const payouts = usePayouts()
  const [sheet, setSheet] = useState(false)
  const p = panel.data

  if (panel.isError && !p) return <ErrorState message={(panel.error as Error).message} onRetry={() => panel.refetch()} />

  const canWithdraw = !!p && !p.payout.inProgress && !p.payout.blockedBy && p.wallet.withdrawableFcfa >= p.payout.minimumFcfa
  const refresh = () => { void panel.refetch(); void payouts.refetch() }

  return (
    <Screen edges={['bottom']} refreshing={panel.isRefetching || payouts.isRefetching} onRefresh={refresh}>
      <View style={{ gap: 4 }}>
        <Text variant="caption">Solde retirable</Text>
        {p ? <Text variant="display" style={styles.big}>{formatFcfa(p.wallet.withdrawableFcfa)}</Text> : <Bone width={200} height={38} />}
      </View>

      {/* D'où vient l'écart entre le solde et ce qui est retirable. */}
      {p ? (
        <View>
          <Line label="Solde" value={formatFcfa(p.wallet.balanceFcfa)} />
          <Divider />
          <Line label="Réservé pour des litiges" value={p.wallet.reservedFcfa ? `− ${formatFcfa(p.wallet.reservedFcfa)}` : formatFcfa(0)} />
          <Divider />
          <Line label="Retrait en cours" value={p.wallet.pendingPayoutFcfa ? `− ${formatFcfa(p.wallet.pendingPayoutFcfa)}` : formatFcfa(0)} />
        </View>
      ) : null}

      {p ? (
        canWithdraw ? (
          <Button label="Demander un retrait" onPress={() => setSheet(true)} />
        ) : (
          <View style={{ gap: 10 }}>
            <View style={styles.note}>
              <Info size={18} color={colors.ink3} style={{ marginTop: 1 }} />
              <Text variant="small" style={{ flex: 1 }}>
                {p.payout.inProgress
                  ? 'Un retrait est déjà en cours : le suivant pourra être demandé une fois celui-ci versé.'
                  : p.payout.blockedBy
                    ? BLOCKED[p.payout.blockedBy]
                    : `Le retrait est possible à partir de ${formatFcfa(p.payout.minimumFcfa)}.`}
              </Text>
            </View>
            {p.payout.blockedBy ? (
              <Button label="Gérer mon moyen de paiement" tone="secondary" onPress={() => openTrainerPage('/formateur/portefeuille/moyen-de-paiement')} />
            ) : null}
          </View>
        )
      ) : null}

      <View>
        <SectionTitle title="Historique des retraits" />
        {payouts.isLoading ? (
          <Bone height={60} style={{ borderRadius: 12 }} />
        ) : payouts.data?.length ? (
          payouts.data.map((payout, i) => (
            <View key={payout.id}>
              {i > 0 ? <Divider /> : null}
              <PayoutRow payout={payout} />
            </View>
          ))
        ) : (
          <Text variant="small">Aucun retrait pour l’instant.</Text>
        )}
      </View>

      {p ? <WithdrawSheet visible={sheet} max={p.wallet.withdrawableFcfa} min={p.payout.minimumFcfa} onClose={() => setSheet(false)} /> : null}
    </Screen>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line}>
      <Text variant="body" style={{ flex: 1 }}>{label}</Text>
      <Text variant="body" style={{ color: colors.ink, fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  big: { fontSize: 34, lineHeight: 40, fontVariant: ['tabular-nums'] },
  line: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  note: { flexDirection: 'row', gap: 10 },
  backdrop: { flex: 1, backgroundColor: 'rgba(21,33,27,0.35)' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: 20, paddingTop: 10, gap: 14 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, marginBottom: 4 },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  amountInput: { flex: 1, fontFamily: fonts.display, fontSize: 40, color: colors.ink, paddingVertical: 4 },
  quick: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
})
