import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native'
import type { ReactNode } from 'react'
import { Text } from './Text'
import { colors, radius, shadow } from './theme'
import { initials } from '../lib/format'

export function Card({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, style, pressed && { opacity: 0.9 }]}>
      {children}
    </Pressable>
  )
}

export function Chip({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'brand' | 'warn' | 'live' }) {
  const t = {
    neutral: { bg: colors.paper, fg: colors.ink2 },
    brand: { bg: colors.brandTint, fg: colors.brand },
    warn: { bg: colors.goldTint, fg: colors.goldInk },
    live: { bg: colors.dangerTint, fg: colors.danger },
  }[tone]
  return (
    <View style={[styles.chip, { backgroundColor: t.bg }]}>
      {/* Une seule ligne, et la police de la variante telle quelle : sur Android,
          surcharger la famille ou l'espacement faisait mesurer le texte trop
          court, et la fin passait sur une seconde ligne invisible (« jeudi
          5 novembre à » sans l'heure). */}
      <Text variant="label" numberOfLines={1} style={{ color: t.fg, fontSize: 12, lineHeight: 16 }}>{label}</Text>
    </View>
  )
}

export function Avatar({ name, size = 44, tone = colors.navy }: { name: string | null; size?: number; tone?: string }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: tone }]}>
      <Text variant="label" style={{ color: '#fff', fontSize: size * 0.36, lineHeight: size * 0.46 }}>{initials(name)}</Text>
    </View>
  )
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="heading">{title}</Text>
      {action}
    </View>
  )
}

/** Filet entre deux lignes d'une liste, décalé pour commencer après la vignette. */
export function Divider({ inset = 0 }: { inset?: number }) {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: inset }} />
}

export function Progress({ value }: { value: number }) {
  return (
    <View style={styles.track}>
      <View style={[styles.bar, { width: `${Math.max(0, Math.min(100, value))}%` }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line2,
    ...shadow.sm,
  },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.line2, overflow: 'hidden' },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.brand },
})
