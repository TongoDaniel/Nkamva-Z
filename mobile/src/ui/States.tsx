import { ActivityIndicator, StyleSheet, View } from 'react-native'
import type { ReactNode } from 'react'
import { CloudOff } from 'lucide-react-native'
import { Text } from './Text'
import { Button } from './Button'
import { colors } from './theme'

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.brand} size="large" />
    </View>
  )
}

/**
 * Écrans vides et d'erreur sur le modèle de `ContentUnavailableView` d'iOS :
 * une grande icône au trait, sans pastille de fond, un titre qui dit ce qui
 * se passe et une phrase qui dit quoi faire. Pas de « Oups ».
 */
export function ErrorState({ message, onRetry, title = 'Chargement impossible', icon }: { message: string; onRetry?: () => void; title?: string; icon?: ReactNode }) {
  return (
    <View style={styles.center}>
      <View style={styles.icon}>{icon ?? <CloudOff color={colors.ink3} size={40} strokeWidth={1.5} />}</View>
      <Text variant="heading" style={styles.text}>{title}</Text>
      <Text variant="body" style={styles.text}>{message}</Text>
      {onRetry ? <Button label="Réessayer" tone="secondary" onPress={onRetry} style={{ marginTop: 8 }} /> : null}
    </View>
  )
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={styles.center}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text variant="heading" style={styles.text}>{title}</Text>
      {body ? <Text variant="body" style={styles.text}>{body}</Text> : null}
      {action ? <View style={{ marginTop: 10 }}>{action}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 6, minHeight: 280 },
  text: { textAlign: 'center' },
  icon: { marginBottom: 6 },
})
