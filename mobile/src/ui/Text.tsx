import { Text as RNText, type TextProps, type TextStyle } from 'react-native'
import { colors, fonts } from './theme'

type Variant = 'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'small' | 'label' | 'caption'

const VARIANTS: Record<Variant, TextStyle> = {
  display: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, color: colors.ink, letterSpacing: -0.6 },
  title: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, color: colors.ink, letterSpacing: -0.4 },
  heading: { fontFamily: fonts.displayMedium, fontSize: 18, lineHeight: 24, color: colors.ink, letterSpacing: -0.2 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.ink2 },
  bodyStrong: { fontFamily: fonts.bodySemi, fontSize: 16, lineHeight: 22, color: colors.ink },
  small: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.ink2 },
  label: { fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 18, color: colors.ink },
  caption: { fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 16, color: colors.ink3, letterSpacing: 0.2 },
}

export function Text({ variant = 'body', style, ...props }: TextProps & { variant?: Variant }) {
  // `simple` : la stratégie par défaut d'Android (`highQuality`) mesure mal
  // les polices personnalisées et coupe la fin des textes courts, la fin
  // d'une date dans une pastille par exemple.
  return <RNText textBreakStrategy="simple" {...props} style={[VARIANTS[variant], style]} />
}
