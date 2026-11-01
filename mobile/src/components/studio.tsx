import { StyleSheet, View } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { AlertCircle, CheckCircle2, Clock, XCircle } from 'lucide-react-native'
import { API_URL } from '../lib/config'
import { formatDate, formatFcfa } from '../lib/format'
import type { Payout, Sale } from '../lib/studio'
import { Text } from '../ui/Text'
import { colors } from '../ui/theme'

/**
 * Ce que l'app ne fait pas encore (saisie longue, téléversement, KYC,
 * moyen de paiement) s'ouvre sur la page du site correspondante, dans le
 * navigateur intégré.
 */
export function openTrainerPage(path: string) {
  void WebBrowser.openBrowserAsync(`${API_URL}${path}`, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
  })
}

function saleStatus(sale: Sale): { label: string; tone: 'ok' | 'warn' | 'bad' | 'muted' } | null {
  if (sale.refundedAt) return { label: 'Remboursée', tone: 'muted' }
  if (sale.disputeActive) return { label: 'Litige en cours', tone: 'warn' }
  // Litige clos, remboursement pas encore passé : l'accès reste coupé.
  if (sale.accessSuspended) return { label: 'Accès suspendu', tone: 'warn' }
  switch (sale.providerStatus) {
    case 'SUCCEEDED': return null
    case 'PENDING': return { label: 'En attente', tone: 'muted' }
    default: return { label: 'Échouée', tone: 'bad' }
  }
}

const TONE = { ok: colors.success, warn: colors.goldInk, bad: colors.danger, muted: colors.ink3 }

/**
 * Une vente, comme une ligne de commande Shopify : ce qui a été vendu et
 * quand à gauche, ce qui revient au formateur à droite. Le statut n'apparaît
 * que s'il sort de l'ordinaire.
 */
export function SaleRow({ sale }: { sale: Sale }) {
  const status = saleStatus(sale)
  const title = sale.subject.kind === 'GONE' ? 'Ressource supprimée' : sale.subject.title
  const kind = sale.subject.kind === 'COMMUNITY' ? 'Adhésion' : 'Ressource'
  const counted = sale.providerStatus === 'SUCCEEDED' && !sale.refundedAt
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={1}>{title}</Text>
        <Text variant="caption">{formatDate(sale.createdAt)} · {kind}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text variant="bodyStrong" style={[styles.amount, !counted && styles.struck]}>{formatFcfa(sale.trainerShareFcfa)}</Text>
        {status ? <Text variant="caption" style={{ color: TONE[status.tone] }}>{status.label}</Text> : null}
      </View>
    </View>
  )
}

const PAYOUT_STATUS: Record<Payout['status'], { label: string; tone: keyof typeof TONE; Icon: typeof Clock }> = {
  PENDING: { label: 'Envoyé', tone: 'muted', Icon: Clock },
  IN_REVIEW: { label: 'En vérification', tone: 'muted', Icon: Clock },
  AUTO_APPROVED: { label: 'Approuvé, versement en cours', tone: 'muted', Icon: Clock },
  APPROVED: { label: 'Approuvé, versement en cours', tone: 'muted', Icon: Clock },
  PAID: { label: 'Versé', tone: 'ok', Icon: CheckCircle2 },
  REJECTED: { label: 'Refusé', tone: 'bad', Icon: XCircle },
  FAILED: { label: 'Échec du versement', tone: 'bad', Icon: AlertCircle },
}

export function PayoutRow({ payout }: { payout: Payout }) {
  const s = PAYOUT_STATUS[payout.status]
  const reason = payout.rejectionReason ?? payout.failureReason
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text variant="bodyStrong">{formatFcfa(payout.amountFcfa)}</Text>
        <View style={styles.status}>
          <s.Icon size={14} color={TONE[s.tone]} />
          <Text variant="caption" style={{ color: TONE[s.tone] }}>{s.label}</Text>
        </View>
        {reason ? <Text variant="caption">{reason}</Text> : null}
      </View>
      <Text variant="caption">{formatDate(payout.paidAt ?? payout.submittedAt)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  amount: { fontVariant: ['tabular-nums'] },
  struck: { color: colors.ink3, textDecorationLine: 'line-through' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5 },
})
