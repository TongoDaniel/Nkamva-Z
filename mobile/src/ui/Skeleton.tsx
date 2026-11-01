import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, View, type DimensionValue, type ViewStyle } from 'react-native'
import { colors, radius, space } from './theme'

/**
 * Bloc gris qui respire, à la forme du contenu attendu. Une seule animation
 * partagée par écran serait plus sobre ; à cette échelle (une dizaine de
 * blocs), chacun la sienne reste imperceptible.
 */
export function Bone({ width = '100%', height = 14, style, round }: { width?: DimensionValue; height?: number; style?: ViewStyle; round?: boolean }) {
  const pulse = useRef(new Animated.Value(0.5)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 650, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])
  return (
    <Animated.View
      style={[
        { width, height, borderRadius: round ? height / 2 : 6, backgroundColor: colors.line2, opacity: pulse },
        style,
      ]}
    />
  )
}

/** Une ligne de bibliothèque : vignette, titre, auteur, progression. */
export function ResourceRowSkeleton() {
  return (
    <View style={styles.row}>
      <Bone width={72} height={72} style={{ borderRadius: radius.md }} />
      <View style={{ flex: 1, gap: 8 }}>
        <Bone width="85%" height={16} />
        <Bone width="55%" />
        <Bone width="100%" height={6} />
      </View>
    </View>
  )
}

export function CourseCardSkeleton({ width }: { width?: number }) {
  return (
    <View style={[styles.card, { width, marginBottom: 0 }]}>
      <Bone height={width ? width * 0.62 : 150} style={{ borderRadius: 0 }} />
      <View style={{ padding: 10, gap: 6 }}>
        <Bone width="90%" height={14} />
        <Bone width="60%" height={12} />
      </View>
    </View>
  )
}

export function ConversationSkeleton() {
  return (
    <View style={[styles.row, { paddingHorizontal: 20, paddingVertical: 14 }]}>
      <Bone width={48} height={48} style={{ borderRadius: 16 }} />
      <View style={{ flex: 1, gap: 8 }}>
        <Bone width="50%" height={16} />
        <Bone width="85%" />
      </View>
    </View>
  )
}

export function LiveCardSkeleton() {
  return (
    <View style={[styles.card, { padding: 16, gap: 10 }]}>
      <Bone width={160} height={22} round />
      <Bone width="90%" height={16} />
      <Bone width="65%" />
    </View>
  )
}

export function Repeat({ count, children }: { count: number; children: React.ReactNode }) {
  return <>{Array.from({ length: count }, (_, i) => <View key={i}>{children}</View>)}</>
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 },
  card: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.line2, overflow: 'hidden', backgroundColor: colors.card, marginBottom: space.md },
})
