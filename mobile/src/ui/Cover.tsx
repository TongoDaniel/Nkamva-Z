import { StyleSheet, View, type ViewStyle } from 'react-native'
import { Image } from 'expo-image'
import { FileText, Package, PlayCircle, Table2, LayoutTemplate } from 'lucide-react-native'
import { courseCoverUrl } from '../lib/api'
import { colors, radius } from './theme'

/**
 * Couverture d'une ressource. Quand le formateur n'en a pas déposé, on dessine
 * la couverture générée du site : une teinte par catégorie et le pictogramme
 * du format. Jamais d'image vide.
 */
const PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: '#e7effb', fg: colors.brand },
  { bg: colors.clayTint, fg: colors.clayInk },
  { bg: colors.goldTint, fg: colors.goldInk },
  { bg: colors.successTint, fg: colors.success },
  { bg: '#e9e5f5', fg: '#4b3a8c' },
  { bg: colors.paper, fg: colors.navy },
]

function hash(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0
  return Math.abs(h)
}

function FormatIcon({ format, color, size }: { format: string; color: string; size: number }) {
  switch (format) {
    case 'video': return <PlayCircle color={color} size={size} strokeWidth={1.6} />
    case 'pdf': return <FileText color={color} size={size} strokeWidth={1.6} />
    case 'kit': return <Package color={color} size={size} strokeWidth={1.6} />
    case 'tableur': return <Table2 color={color} size={size} strokeWidth={1.6} />
    default: return <LayoutTemplate color={color} size={size} strokeWidth={1.6} />
  }
}

interface Props {
  course: { id: string; category: string; format: string; coverS3Key: string | null }
  height?: number
  style?: ViewStyle
  rounded?: boolean
}

export function Cover({ course, height = 140, style, rounded = true }: Props) {
  const tone = PALETTE[hash(course.category) % PALETTE.length]
  return (
    <View style={[styles.box, { height, backgroundColor: tone.bg, borderRadius: rounded ? radius.md : 0 }, style]}>
      <FormatIcon format={course.format} color={tone.fg} size={Math.min(56, height * 0.38)} />
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
  box: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
})
