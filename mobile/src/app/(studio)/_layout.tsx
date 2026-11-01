import { Platform } from 'react-native'
import { NativeTabs } from 'expo-router/native-tabs'
import { useConversations } from '../../lib/queries'
import { colors, fonts } from '../../ui/theme'

/** Le mode formateur s'ouvre toujours sur son tableau de bord. */
export const unstable_settings = { initialRouteName: 'tableau' }

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
 * Barre d'onglets du mode formateur, sur le modèle de YouTube Studio : le
 * pilotage d'abord, puis ce que le formateur produit (ressources, lives),
 * ses échanges et son compte. Même barre native que le mode apprenant.
 */
export default function StudioLayout() {
  const { data: conversations } = useConversations()
  const unread = conversations?.reduce((n, c) => n + c.unreadCount, 0) ?? 0

  return (
    <NativeTabs tintColor={colors.brand} minimizeBehavior="onScrollDown" {...ANDROID}>
      <NativeTabs.Trigger name="tableau">
        <NativeTabs.Trigger.Icon sf={{ default: 'chart.bar', selected: 'chart.bar.fill' }} md="dashboard" />
        <NativeTabs.Trigger.Label>Accueil</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="contenus">
        <NativeTabs.Trigger.Icon sf={{ default: 'square.stack', selected: 'square.stack.fill' }} md="video_library" />
        <NativeTabs.Trigger.Label>Ressources</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="seances">
        <NativeTabs.Trigger.Icon sf={{ default: 'video', selected: 'video.fill' }} md="videocam" />
        <NativeTabs.Trigger.Label>Lives</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="discussions">
        <NativeTabs.Trigger.Icon sf={{ default: 'bubble.left.and.bubble.right', selected: 'bubble.left.and.bubble.right.fill' }} md="chat" />
        <NativeTabs.Trigger.Label>Messages</NativeTabs.Trigger.Label>
        {unread > 0 ? <NativeTabs.Trigger.Badge>{unread > 99 ? '99+' : String(unread)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="reglages">
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} md="person" />
        <NativeTabs.Trigger.Label>Compte</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}
