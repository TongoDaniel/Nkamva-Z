import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native'
import { SafeAreaView, type Edge } from 'react-native-safe-area-context'
import type { ReactNode } from 'react'
import { colors, space } from './theme'

interface Props {
  children: ReactNode
  scroll?: boolean
  edges?: Edge[]
  style?: ViewStyle
  contentStyle?: ViewStyle
  refreshing?: boolean
  onRefresh?: () => void
  keyboard?: boolean
}

/** Fond, zones sûres, défilement et clavier : le cadre de tous les écrans. */
export function Screen({ children, scroll = true, edges = ['top'], style, contentStyle, refreshing, onRefresh, keyboard }: Props) {
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.content, contentStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.brand} /> : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.fill, contentStyle]}>{children}</View>
  )

  return (
    <SafeAreaView edges={edges} style={[styles.fill, { backgroundColor: colors.background }, style]}>
      {keyboard ? (
        <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {body}
        </KeyboardAvoidingView>
      ) : body}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: space.lg + 4, paddingBottom: space.xxl * 2, gap: space.lg },
})
