import { useState, type Ref } from 'react'
import { Pressable, StyleSheet, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native'
import { Eye, EyeOff } from 'lucide-react-native'
import { Text } from './Text'
import { colors, fonts, radius } from './theme'

interface Props extends TextInputProps {
  ref?: Ref<TextInputInstance>
  label: string
  error?: string | null
  hint?: string
  secret?: boolean
}

export function Field({ ref, label, error, hint, secret, style, ...props }: Props) {
  const [focused, setFocused] = useState(false)
  const [hidden, setHidden] = useState(true)
  return (
    <View style={styles.wrap}>
      <Text variant="label">{label}</Text>
      <View
        style={[
          styles.box,
          { borderColor: error ? colors.danger : focused ? colors.brand : colors.line },
        ]}
      >
        <TextInput
          ref={ref}
          placeholderTextColor={colors.hairline}
          secureTextEntry={secret && hidden}
          onFocus={(e) => { setFocused(true); props.onFocus?.(e) }}
          onBlur={(e) => { setFocused(false); props.onBlur?.(e) }}
          style={[styles.input, style]}
          {...props}
        />
        {secret ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Afficher le mot de passe' : 'Masquer le mot de passe'}
            onPress={() => setHidden((h) => !h)}
            hitSlop={10}
            style={styles.eye}
          >
            {hidden ? <Eye size={20} color={colors.ink3} /> : <EyeOff size={20} color={colors.ink3} />}
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text variant="small" style={{ color: colors.danger }}>{error}</Text>
      ) : hint ? (
        <Text variant="caption">{hint}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: radius.sm + 4,
    backgroundColor: colors.card,
  },
  input: {
    flex: 1,
    minHeight: 52,
    paddingHorizontal: 16,
    fontFamily: fonts.body,
    // 16 px au moins : en dessous, iOS zoome sur le champ au focus.
    fontSize: 16,
    color: colors.ink,
  },
  eye: { paddingHorizontal: 14, minHeight: 52, justifyContent: 'center' },
})
