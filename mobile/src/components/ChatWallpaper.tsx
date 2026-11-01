import { StyleSheet } from 'react-native'
import Svg, { Circle, Defs, Path, Pattern, Rect } from 'react-native-svg'
import { colors } from '../ui/theme'

/**
 * Fond de discussion à motifs, dans l'esprit de WhatsApp mais en clair : des
 * pictogrammes d'apprentissage (livre, ampoule, bulle, étoile, crayon, lecture)
 * au trait très léger sur le papier de la marque. Un seul motif SVG répété :
 * rien à télécharger, net à toutes les densités d'écran.
 */
const STROKE = '#e3dccc'

export function ChatWallpaper() {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Pattern id="nk-doodles" patternUnits="userSpaceOnUse" width={180} height={180}>
          <Rect width={180} height={180} fill={colors.paper} />
          {/* Livre ouvert */}
          <Path d="M14 30 q10 -6 20 0 v22 q-10 -6 -20 0 z M34 30 q10 -6 20 0 v22 q-10 -6 -20 0 z" stroke={STROKE} strokeWidth={1.6} fill="none" strokeLinejoin="round" />
          {/* Ampoule */}
          <Path d="M110 22 a12 12 0 1 1 14 0 v8 h-14 z M112 34 h10" stroke={STROKE} strokeWidth={1.6} fill="none" strokeLinecap="round" />
          {/* Bulle de discussion */}
          <Path d="M146 74 h24 a6 6 0 0 1 6 6 v12 a6 6 0 0 1 -6 6 h-14 l-8 7 v-7 h-2 a6 6 0 0 1 -6 -6 v-12 a6 6 0 0 1 6 -6 z" stroke={STROKE} strokeWidth={1.6} fill="none" strokeLinejoin="round" />
          {/* Étoile */}
          <Path d="M60 96 l4 9 10 1 -8 6 3 10 -9 -6 -9 6 3 -10 -8 -6 10 -1 z" stroke={STROKE} strokeWidth={1.6} fill="none" strokeLinejoin="round" />
          {/* Crayon */}
          <Path d="M104 140 l26 -26 6 6 -26 26 -8 2 z M126 118 l6 6" stroke={STROKE} strokeWidth={1.6} fill="none" strokeLinejoin="round" />
          {/* Bouton lecture */}
          <Circle cx={30} cy={150} r={12} stroke={STROKE} strokeWidth={1.6} fill="none" />
          <Path d="M26 144 l10 6 -10 6 z" stroke={STROKE} strokeWidth={1.6} fill="none" strokeLinejoin="round" />
          {/* Petits points de liaison */}
          <Circle cx={88} cy={60} r={2} fill={STROKE} />
          <Circle cx={160} cy={150} r={2} fill={STROKE} />
          <Circle cx={10} cy={96} r={2} fill={STROKE} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#nk-doodles)" />
    </Svg>
  )
}
