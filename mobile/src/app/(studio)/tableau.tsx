import { StyleSheet, View } from 'react-native'
import { Link, router } from 'expo-router'
import { AlertTriangle, CheckCircle2, CreditCard, FileClock, Gavel, MessageCircle, Users, Wallet } from 'lucide-react-native'
import { useProfile } from '../../lib/queries'
import { useSales, useTrainerOverview, useTrainerSessions } from '../../lib/studio'
import { firstName, formatDate, formatFcfa } from '../../lib/format'
import { Screen } from '../../ui/Screen'
import { Text } from '../../ui/Text'
import { Button } from '../../ui/Button'
import { Card, Divider, SectionTitle } from '../../ui/Bits'
import { ListGroup, ListRow } from '../../ui/ListGroup'
import { ErrorState } from '../../ui/States'
import { Bone } from '../../ui/Skeleton'
import { colors } from '../../ui/theme'
import { isUpcoming, LiveCard } from '../../components/cards'
import { openTrainerPage, SaleRow } from '../../components/studio'

const ICON = { size: 20, color: colors.ink2 }

/**
 * Tableau de bord du formateur, sur le modèle de l'accueil de Shopify : ce
 * qu'il peut retirer, ce qui attend une action de sa part, ses chiffres, et
 * ses dernières ventes. Les montants viennent des mêmes fonctions que la page
 * `/formateur` du site.
 */
export default function Tableau() {
  const profile = useProfile()
  const panel = useTrainerOverview()
  const sales = useSales()
  const sessions = useTrainerSessions()

  const p = panel.data
  const recent = sales.data?.pages[0]?.data.slice(0, 3) ?? []
  const next = (sessions.data ?? []).filter(isUpcoming).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0]
  const refresh = () => { void panel.refetch(); void sales.refetch(); void sessions.refetch() }

  if (panel.isError && !p) {
    return <ErrorState message={(panel.error as Error).message} onRetry={() => panel.refetch()} />
  }

  // Ce qui attend le formateur, et rien d'autre : une ligne n'apparaît que
  // si elle a lieu d'être.
  const todo = p ? [
    p.subscription?.subscriptionStatus === 'PAST_DUE'
      ? <ListRow key="sub" icon={<AlertTriangle size={20} color={colors.danger} />} label="Abonnement à régler" detail={p.subscription.suspensionAt ? `Suspension le ${formatDate(p.subscription.suspensionAt)}` : undefined} value={formatFcfa(p.subscription.dueTotalFcfa)} onPress={() => openTrainerPage('/formateur/abonnement')} />
      : null,
    p.disputesToContest > 0
      ? <ListRow key="disp" icon={<Gavel {...ICON} />} label="Litiges sans réponse" value={String(p.disputesToContest)} onPress={() => router.push('/studio/litiges')} />
      : null,
    p.unreadMessages > 0
      ? <ListRow key="msg" icon={<MessageCircle {...ICON} />} label="Messages non lus" value={String(p.unreadMessages)} onPress={() => router.navigate('/discussions')} />
      : null,
    p.payout.blockedBy === 'PAYOUT_METHOD_MISSING'
      ? <ListRow key="pm" icon={<CreditCard {...ICON} />} label="Ajouter un moyen de paiement" detail="Indispensable pour retirer tes revenus." onPress={() => openTrainerPage('/formateur/portefeuille/moyen-de-paiement')} />
      : null,
    p.overview.draftCount > 0
      ? <ListRow key="draft" icon={<FileClock {...ICON} />} label="Ressources en brouillon" value={String(p.overview.draftCount)} onPress={() => router.navigate('/contenus')} />
      : null,
  ].filter(Boolean) : []

  return (
    <Screen refreshing={panel.isRefetching} onRefresh={refresh}>
      {profile.isLoading ? (
        <Bone width={220} height={28} />
      ) : (
        <Text variant="title">Bonjour {firstName(profile.data?.preferredName || profile.data?.fullName)}</Text>
      )}

      {/* Le solde retirable d'abord : c'est la question que se pose un
          formateur en ouvrant l'app. Le détail est sur l'écran Portefeuille. */}
      <Card style={styles.balance} onPress={() => router.push('/studio/portefeuille')}>
        <Text variant="caption">Solde retirable</Text>
        {p ? (
          <>
            <Text variant="display" style={styles.balanceValue}>{formatFcfa(p.wallet.withdrawableFcfa)}</Text>
            <Text variant="small">
              {p.payout.inProgress ? 'Un retrait est en cours de traitement.' : `Sur un solde de ${formatFcfa(p.wallet.balanceFcfa)}.`}
            </Text>
          </>
        ) : (
          <Bone width={180} height={34} style={{ marginVertical: 4 }} />
        )}
        <View style={styles.balanceLink}>
          <Wallet size={16} color={colors.brand} />
          <Text variant="label" style={{ color: colors.brand }}>Portefeuille et retraits</Text>
        </View>
      </Card>

      <View>
        <SectionTitle title="À faire" />
        {!p ? (
          <Bone height={56} style={{ borderRadius: 16 }} />
        ) : todo.length ? (
          <ListGroup>{todo}</ListGroup>
        ) : (
          <View style={styles.allDone}>
            <CheckCircle2 size={18} color={colors.success} />
            <Text variant="small">Rien ne t’attend pour l’instant.</Text>
          </View>
        )}
      </View>

      {/* Trois chiffres, séparés par des filets, comme la bande d'infos de
          l'App Store : pas de tuiles colorées. */}
      <View style={styles.facts}>
        {[
          { k: 'Ventes', v: p ? String(p.overview.salesCount) : null },
          { k: 'Revenus nets', v: p ? formatFcfa(p.overview.netRevenueFcfa) : null },
          { k: 'Membres actifs', v: p ? String(p.activeMembers) : null },
        ].map((f, i) => (
          <View key={f.k} style={[styles.fact, i > 0 && styles.factSep]}>
            <Text variant="caption" numberOfLines={1}>{f.k}</Text>
            {f.v === null ? <Bone width={60} height={18} /> : <Text variant="label" numberOfLines={1} style={{ fontSize: 15 }}>{f.v}</Text>}
          </View>
        ))}
      </View>

      <View>
        <SectionTitle
          title="Dernières ventes"
          action={recent.length ? <Link href="/studio/ventes"><Text variant="label" style={{ color: colors.brand }}>Tout voir</Text></Link> : undefined}
        />
        {sales.isLoading ? (
          <Bone height={120} style={{ borderRadius: 16 }} />
        ) : recent.length ? (
          recent.map((sale, i) => (
            <View key={sale.id}>
              {i > 0 ? <Divider /> : null}
              <SaleRow sale={sale} />
            </View>
          ))
        ) : (
          <Text variant="small">Tes ventes apparaîtront ici dès la première.</Text>
        )}
      </View>

      <View>
        <SectionTitle
          title="Prochain live"
          action={<Link href="/studio/programmer-live"><Text variant="label" style={{ color: colors.brand }}>Programmer</Text></Link>}
        />
        {next ? <LiveCard session={next} /> : <Text variant="small">Aucune séance programmée.</Text>}
      </View>

      <ListGroup>
        <ListRow icon={<Users {...ICON} />} label="Ma communauté" onPress={() => router.push('/studio/communaute')} />
        <ListRow icon={<Gavel {...ICON} />} label="Litiges" onPress={() => router.push('/studio/litiges')} />
      </ListGroup>

      <Button label="Ouvrir l’espace formateur du site" tone="ghost" onPress={() => openTrainerPage('/formateur')} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  balance: { padding: 18, gap: 4 },
  balanceValue: { fontSize: 32, lineHeight: 38, fontVariant: ['tabular-nums'] },
  balanceLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  allDone: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  facts: { flexDirection: 'row', paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  fact: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 6 },
  factSep: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.line },
})
