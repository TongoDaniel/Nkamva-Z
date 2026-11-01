import { useRef, useState } from 'react'
import { Pressable, StyleSheet, TextInput, View, type TextInputInstance } from 'react-native'
import { Text } from './Text'
import { colors, fonts, radius } from './theme'

const LENGTH = 6

interface Props {
  label: string
  value: string
  onChange: (code: string) => void
  error?: string | null
  autoFocus?: boolean
  onComplete?: (code: string) => void
}

/**
 * Saisie d'un code à six chiffres en six cases, comme chez WhatsApp ou
 * Stripe. Un seul champ invisible reçoit la frappe (et le code proposé par
 * le clavier, `one-time-code`) ; les cases ne font qu'afficher.
 */
export function CodeInput({ label, value, onChange, error, autoFocus, onComplete }: Props) {
  const input = useRef<TextInputInstance>(null)
  const [focused, setFocused] = useState(false)

  function change(text: string) {
    const code = text.replace(/\D/g, '').slice(0, LENGTH)
    onChange(code)
    if (code.length === LENGTH) onComplete?.(code)
  }

  return (
    <View style={styles.wrap}>
      <Text variant="label">{label}</Text>
      <Pressable onPress={() => input.current?.focus()} accessibilityRole="none" style={styles.row}>
        {Array.from({ length: LENGTH }, (_, i) => {
          const active = focused && (i === value.length || (i === LENGTH - 1 && value.length === LENGTH))
          return (
            <View
              key={i}
              style={[styles.box, { borderColor: error ? colors.danger : active ? colors.brand : colors.line }]}
            >
              <Text style={styles.digit}>{value[i] ?? ''}</Text>
            </View>
          )
        })}
        <TextInput
          ref={input}
          value={value}
          onChangeText={change}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={LENGTH}
          autoFocus={autoFocus}
          caretHidden
          accessibilityLabel={label}
          style={styles.hidden}
        />
      </Pressable>
      {error ? <Text variant="small" style={{ color: colors.danger }}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  box: {
    flex: 1,
    height: 56,
    borderWidth: 1.5,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  digit: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, color: colors.ink },
  // Couvre les cases pour que le toucher et le collage arrivent au champ,
  // sans rien afficher.
  hidden: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.011, color: 'transparent' },
})
