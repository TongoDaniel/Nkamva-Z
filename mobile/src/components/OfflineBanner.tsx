import { useSyncExternalStore } from 'react'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { onlineManager } from '@tanstack/react-query'
import { WifiOff } from 'lucide-react-native'
import { Text } from '../ui/Text'
import { colors, radius } from '../ui/theme'

function useOnline() {
  return useSyncExternalStore(
    (notify) => onlineManager.subscribe(notify),
    () => onlineManager.isOnline(),
  )
}

/**
 * Barre sombre posée au-dessus des onglets tant que le téléphone n'a pas de
 * réseau, comme celle de YouTube. En haut, elle recouvrait le titre de
 * l'écran ; en jaune sur jaune, elle faisait « interface générée ».
 */
export function OfflineBanner() {
  const online = useOnline()
  const insets = useSafeAreaInsets()
  if (online) return null
  return (
    <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 92 }]}>
      <View style={styles.banner} accessibilityRole="alert">
        <WifiOff size={16} color="#fff" />
        <Text variant="small" style={styles.text}>Hors ligne · tu vois le contenu enregistré</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, zIndex: 10, alignItems: 'center' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.ink,
  },
  text: { color: '#fff', fontFamily: 'InstrumentSans_500Medium' },
})
