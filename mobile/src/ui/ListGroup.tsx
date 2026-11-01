import { Children, Fragment, type ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { ChevronRight } from 'lucide-react-native'
import { Text } from './Text'
import { Card } from './Bits'
import { colors } from './theme'

/**
 * Groupe de lignes à la manière des Réglages iOS : un encadré, des filets
 * entre les lignes qui commencent après l'icône, et un chevron quand la ligne
 * mène ailleurs.
 */
export function ListGroup({ children }: { children: ReactNode }) {
  const rows = Children.toArray(children).filter(Boolean)
  return (
    <Card style={{ overflow: 'hidden' }}>
      {rows.map((row, i) => (
        <Fragment key={i}>
          {i > 0 ? <View style={styles.sep} /> : null}
          {row}
        </Fragment>
      ))}
    </Card>
  )
}

interface RowProps {
  icon?: ReactNode
  label: string
  detail?: string
  /** Valeur à droite, avant le chevron (« 2 », « 35 875 FCFA »). */
  value?: string
  onPress?: () => void
  danger?: boolean
}

export function ListRow({ icon, label, detail, value, onPress, danger }: RowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.paper }]}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      {icon}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" style={{ color: danger ? colors.danger : colors.ink }} numberOfLines={1}>{label}</Text>
        {detail ? <Text variant="caption" numberOfLines={2}>{detail}</Text> : null}
      </View>
      {value ? <Text variant="small" style={{ color: colors.ink3 }}>{value}</Text> : null}
      {onPress && !danger ? <ChevronRight size={18} color={colors.hairline} /> : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 56, paddingVertical: 10 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: 50 },
})
