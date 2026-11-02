import { Platform } from 'react-native'
import { NativeTabs } from 'expo-router/native-tabs'
import { useConversations } from '../../lib/queries'
import { useAuth } from '../../lib/auth'
import { colors, fonts } from '../../ui/theme'

/**
 * Couleurs de marque sur Android seulement. Sur iOS, une couleur de fond
 * remplacerait le verre : on laisse le système dessiner sa barre.
 */
const ANDROID = Platform.OS === 'android'
  ? {
      backgroundColor: colors.background,
      indicatorColor: colors.brandTint,
      iconColor: { default: colors.ink3, selected: colors.brand },
      labelStyle: { default: { color: colors.ink3, fontFamily: fonts.bodySemi }, selected: { color: colors.brand, fontFamily: fonts.bodySemi } },
      labelVisibilityMode: 'labeled' as const,
      rippleColor: colors.brandTint,
      badgeBackgroundColor: colors.brand,
    }
  : {}

/**
 * Barre d'onglets native : sur iOS 26, c'est la barre flottante Liquid Glass
 * du système (réfraction, morphose, repli au défilement) ; avant iOS 26, la
 * barre iOS classique ; sur Android, la barre Material 3. Le système la dessine
 * lui-même : rien n'est imité en JavaScript.
 *
 * Cinq destinations dans la zone du pouce pour un membre, comme le
 * recommandait l'analyse mobile first du site (`docs/mobile-first-analyse.md`
 * § 3.3) ; quatre pour un visiteur, tournées vers la découverte.
 */
export default function TabsLayout() {
  const { data: conversations } = useConversations()
  const { status } = useAuth()
  const signedIn = status === 'signedIn'
  const unread = signedIn ? conversations?.reduce((n, c) => n + c.unreadCount, 0) ?? 0 : 0

  return (
    <NativeTabs tintColor={colors.brand} minimizeBehavior="onScrollDown" {...ANDROID}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
        <NativeTabs.Trigger.Label>Accueil</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="explorer">
        <NativeTabs.Trigger.Icon sf={{ default: 'safari', selected: 'safari.fill' }} md="explore" />
        <NativeTabs.Trigger.Label>Explorer</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      {/* Visiteur : une bibliothèque et des messages vides ne l'aident pas à
          décider. À leur place, les communautés, le cœur de NKAMVA, ont leur
          onglet. Un membre les retrouve dans Explorer et dans son Compte. */}
      <NativeTabs.Trigger name="communautes" hidden={signedIn}>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.3', selected: 'person.3.fill' }} md="groups" />
        <NativeTabs.Trigger.Label>Communautés</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="bibliotheque" hidden={!signedIn}>
        <NativeTabs.Trigger.Icon sf={{ default: 'books.vertical', selected: 'books.vertical.fill' }} md="local_library" />
        <NativeTabs.Trigger.Label>Bibliothèque</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="messages" hidden={!signedIn}>
        <NativeTabs.Trigger.Icon sf={{ default: 'bubble.left.and.bubble.right', selected: 'bubble.left.and.bubble.right.fill' }} md="chat" />
        <NativeTabs.Trigger.Label>Messages</NativeTabs.Trigger.Label>
        {/* Rendue seulement s'il y a du non-lu : Android ignore `hidden` et
            affichait « 0 ». */}
        {unread > 0 ? <NativeTabs.Trigger.Badge>{unread > 99 ? '99+' : String(unread)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="compte">
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} md="person" />
        <NativeTabs.Trigger.Label>Compte</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}
