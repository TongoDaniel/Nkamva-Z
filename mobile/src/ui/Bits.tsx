import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native'
import type { ReactNode } from 'react'
import { Text } from './Text'
import { colors, radius } from './theme'
import { initials } from '../lib/format'
import { Image } from 'expo-image'
import { API_URL } from '../lib/config'

export function Card({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, style, pressed && { opacity: 0.9 }]}>
      {children}
    </Pressable>
  )
}

/**
 * Étiquette. Contour fin et texte encre, jamais de texte teinté sur un aplat
 * pastel de la même teinte (le motif qui fait « interface générée »). Seule
 * exception, « En direct » : un badge plein, comme sur YouTube ou Instagram,
 * parce que c'est un signal à repérer d'un coup d'œil.
 */
export function Chip({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'warn' | 'live' }) {
  const t = {
    neutral: { bg: 'transparent', border: colors.line, fg: colors.ink2 },
    warn: { bg: 'transparent', border: colors.gold, fg: colors.goldInk },
    live: { bg: colors.danger, border: colors.danger, fg: '#fff' },
  }[tone]
  return (
    <View style={[styles.chip, { backgroundColor: t.bg, borderColor: t.border }]}>
      {/* Une seule ligne, et la police de la variante telle quelle : sur Android,
          surcharger la famille ou l'espacement faisait mesurer le texte trop
          court, et la fin passait sur une seconde ligne invisible (« jeudi
          5 novembre à » sans l'heure). */}
      <Text variant="label" numberOfLines={1} style={{ color: t.fg, fontSize: 12, lineHeight: 16 }}>{label}</Text>
    </View>
  )
}

/**
 * La photo quand il y en a une (adresse du site relative ou externe), les
 * initiales sinon.
 */
export function Avatar({ name, size = 44, tone = colors.navy, uri }: { name: string | null; size?: number; tone?: string; uri?: string | null }) {
  if (uri) {
    const src = uri.startsWith('/') ? `${API_URL}${uri}` : uri
    return <Image source={src} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.paper }} contentFit="cover" accessibilityIgnoresInvertColors />
  }
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: tone }]}>
      <Text variant="label" style={{ color: '#fff', fontSize: size * 0.36, lineHeight: size * 0.46 }}>{initials(name)}</Text>
    </View>
  )
}

const COMMUNITY_TONES = [colors.navy, colors.brand, colors.clayInk, colors.success, colors.goldInk, '#4b3a8c']

/**
 * Icône d'une communauté, comme celle d'un serveur Discord ou d'un espace
 * Slack : les initiales sur un carré arrondi de couleur franche, stable pour
 * un même nom. Remplace le pictogramme « groupe » sur aplat bleu pâle.
 */
export function CommunityAvatar({ name, size = 48 }: { name: string; size?: number }) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  const tone = COMMUNITY_TONES[Math.abs(h) % COMMUNITY_TONES.length]
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: Math.round(size * 0.28), backgroundColor: tone }]}>
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
    // Un filet, pas d'ombre : filet et ombre portée ensemble sur la même
    // carte font partie des tics des interfaces générées.
    borderColor: colors.line,
  },
  chip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1, alignSelf: 'flex-start' },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.line2, overflow: 'hidden' },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.brand },
})
