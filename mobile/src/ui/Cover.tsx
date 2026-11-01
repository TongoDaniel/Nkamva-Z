import { StyleSheet, View, type ViewStyle } from 'react-native'
import { Image } from 'expo-image'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { FileText, Package, PlayCircle, Table2, LayoutTemplate } from 'lucide-react-native'
import { courseCoverUrl } from '../lib/api'
import { colors, radius } from './theme'

/**
 * Couverture d'une ressource. Quand le formateur n'en a pas déposé, on dessine
 * une couverture d'éditeur, à la manière des collections de poche : un fond
 * franc et une composition géométrique, tous deux propres à la ressource
 * (une teinte par catégorie donnait une bibliothèque presque toute marine).
 * Pas de pictogramme centré sur un aplat pastel ni de titre répété (il est
 * déjà sous la couverture) : c'est ce qui donnait l'air « généré ».
 */
const PALETTE: Array<{ bg: string; accent: string }> = [
  { bg: colors.navy, accent: colors.azure },
  { bg: colors.brand, accent: '#9fc1fb' },
  { bg: colors.clayInk, accent: '#f0b37e' },
  { bg: colors.success, accent: '#8fd3b6' },
  { bg: colors.goldInk, accent: '#f2d27a' },
  { bg: colors.ink, accent: colors.clay },
]

function hash(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0
  return Math.abs(h)
}

const LIGHT = 'rgba(255,255,255,0.13)'
const DARK = 'rgba(0,0,0,0.16)'

/** Cinq compositions, dessinées dans un carré 100 × 100 rogné au format de la vignette. */
function Composition({ variant, accent }: { variant: number; accent: string }) {
  switch (variant) {
    case 0: // Grand disque qui sort du cadre, petit point d'accent.
      return (
        <>
          <Circle cx={80} cy={88} r={58} fill={LIGHT} />
          <Circle cx={80} cy={88} r={30} fill={DARK} />
          <Circle cx={24} cy={26} r={8} fill={accent} />
        </>
      )
    case 1: // Arcs concentriques depuis un coin.
      return (
        <>
          {[26, 46, 66, 86].map((r) => (
            <Circle key={r} cx={0} cy={100} r={r} fill="none" stroke={LIGHT} strokeWidth={8} />
          ))}
          <Circle cx={0} cy={100} r={12} fill={accent} />
        </>
      )
    case 2: // Bandes obliques.
      return (
        <>
          <Path d="M-10 70 L70 -10 L90 -10 L-10 90 Z" fill={LIGHT} />
          <Path d="M10 110 L110 10 L110 34 L34 110 Z" fill={DARK} />
          <Path d="M52 110 L110 52 L110 62 L62 110 Z" fill={accent} />
        </>
      )
    case 3: // Quarts de cercle en damier.
      return (
        <>
          <Path d="M0 0 H50 A50 50 0 0 1 0 50 Z" fill={LIGHT} />
          <Path d="M100 50 A50 50 0 0 0 50 100 H100 Z" fill={DARK} />
          <Path d="M50 50 H100 A50 50 0 0 1 50 100 Z" fill={LIGHT} />
          <Circle cx={25} cy={75} r={11} fill={accent} />
        </>
      )
    default: // Demi-disque posé sur une barre.
      return (
        <>
          <Rect x={0} y={68} width={100} height={32} fill={DARK} />
          <Path d="M18 68 A32 32 0 0 1 82 68 Z" fill={LIGHT} />
          <Rect x={0} y={64} width={100} height={4} fill={accent} />
        </>
      )
  }
}

function FormatMark({ format, size }: { format: string; size: number }) {
  const props = { color: '#fff', size, strokeWidth: 1.8, opacity: 0.9 }
  switch (format) {
    case 'video': return <PlayCircle {...props} />
    case 'pdf': return <FileText {...props} />
    case 'kit': return <Package {...props} />
    case 'tableur': return <Table2 {...props} />
    default: return <LayoutTemplate {...props} />
  }
}

interface Props {
  course: { id: string; format: string; coverS3Key: string | null }
  height?: number
  style?: ViewStyle
  rounded?: boolean
}

export function Cover({ course, height = 140, style, rounded = true }: Props) {
  const tone = PALETTE[hash(course.id) % PALETTE.length]
  const variant = hash(`${course.id}:forme`) % 5
  // Sur une vignette de liste, la composition seule : la marque du format y
  // serait illisible, et le format est écrit à côté.
  const showMark = height >= 100
  return (
    <View
      style={[styles.box, { height, backgroundColor: tone.bg, borderRadius: rounded ? (height < 100 ? radius.sm : radius.md) : 0 }, style]}
    >
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
        <Composition variant={variant} accent={tone.accent} />
      </Svg>
      {showMark ? (
        <View style={styles.mark}>
          <FormatMark format={course.format} size={Math.min(22, Math.round(height * 0.14))} />
        </View>
      ) : null}
      {course.coverS3Key ? (
        <Image
          // Pas d'en-tête d'authentification : la route redirige vers une URL
          // signée, et le stockage refuse une requête qui porte deux
          // mécanismes d'authentification. Une couverture publiée est publique.
          source={{ uri: courseCoverUrl(course.id) }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden' },
  mark: { position: 'absolute', left: 12, bottom: 12 },
})
