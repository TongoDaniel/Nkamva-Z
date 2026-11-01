import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native'
import type { ReactNode } from 'react'
import { Text } from './Text'
import { colors, radius } from './theme'

type Tone = 'primary' | 'secondary' | 'ghost' | 'danger'

interface Props {
  label: string
  onPress?: () => void
  tone?: Tone
  loading?: boolean
  disabled?: boolean
  icon?: ReactNode
  style?: ViewStyle
}

const TONES: Record<Tone, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.brand, fg: '#ffffff', border: colors.brand },
  secondary: { bg: colors.card, fg: colors.ink, border: colors.line },
  ghost: { bg: 'transparent', fg: colors.brand, border: 'transparent' },
  danger: { bg: colors.card, fg: colors.danger, border: colors.line },
}

export function Button({ label, onPress, tone = 'primary', loading, disabled, icon, style }: Props) {
  const t = TONES[tone]
  const inactive = disabled || loading
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: t.bg, borderColor: t.border, opacity: inactive ? 0.55 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={t.fg} />
      ) : (
        <View style={styles.row}>
          {icon}
          <Text variant="label" style={{ color: t.fg, fontSize: 16 }}>{label}</Text>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
})
