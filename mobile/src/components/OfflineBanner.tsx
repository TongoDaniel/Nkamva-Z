import { useSyncExternalStore } from 'react'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { onlineManager } from '@tanstack/react-query'
import { WifiOff } from 'lucide-react-native'
import { Text } from '../ui/Text'
import { colors } from '../ui/theme'

function useOnline() {
  return useSyncExternalStore(
    (notify) => onlineManager.subscribe(notify),
    () => onlineManager.isOnline(),
  )
}

/** Bandeau discret en haut de l'écran tant que le téléphone n'a pas de réseau. */
export function OfflineBanner() {
  const online = useOnline()
  const insets = useSafeAreaInsets()
  if (online) return null
  return (
    <View style={[styles.banner, { paddingTop: insets.top + 6 }]} accessibilityRole="alert">
      <WifiOff size={15} color={colors.goldInk} />
      <Text variant="caption" style={styles.text}>Hors ligne · tu vois le contenu enregistré</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: 6,
    backgroundColor: colors.goldTint,
  },
  text: { color: colors.goldInk, fontFamily: 'InstrumentSans_600SemiBold', letterSpacing: 0 },
})
