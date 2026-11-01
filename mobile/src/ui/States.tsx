import { ActivityIndicator, StyleSheet, View } from 'react-native'
import type { ReactNode } from 'react'
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

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Text variant="heading" style={styles.text}>Oups</Text>
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
      {action}
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8, minHeight: 280 },
  text: { textAlign: 'center' },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
})
