import { useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BookOpen, MessagesSquare, Search, Video, X } from 'lucide-react-native'
import { Text } from '../../ui/Text'
import { colors, fonts, radius } from '../../ui/theme'
import { CommunityDirectory, useDebounced } from '../../components/discovery'

const PROMISES = [
  { Icon: MessagesSquare, text: 'Un groupe d’entraide avec l’animateur et les autres membres' },
  { Icon: Video, text: 'Des lives réguliers pour poser tes questions en direct' },
  { Icon: BookOpen, text: 'Des ressources incluses, à suivre dans l’app' },
]

/**
 * Onglet Communautés du visiteur. Avant la liste, ce qu'est une communauté
 * NKAMVA, en trois lignes : sans cela, « 12 membres » ne dit pas pourquoi
 * entrer. La liste vient de l'annuaire public, comme sur le site.
 */
export default function Communautes() {
  const [query, setQuery] = useState('')
  const search = useDebounced(query.trim())

  const header = search ? undefined : (
    <View style={styles.promises}>
      {PROMISES.map(({ Icon, text }) => (
        <View key={text} style={styles.promise}>
          <Icon size={18} color={colors.brand} />
          <Text variant="small" style={{ flex: 1, color: colors.ink2 }}>{text}</Text>
        </View>
      ))}
    </View>
  )

  return (
    <SafeAreaView edges={['top']} style={styles.fill}>
      <View style={styles.head}>
        <Text variant="title">Communautés</Text>
        <View style={styles.search}>
          <Search size={20} color={colors.ink3} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Une communauté, un animateur…"
            placeholderTextColor={colors.hairline}
            style={styles.input}
            returnKeyType="search"
            autoCorrect={false}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Effacer la recherche">
              <X size={18} color={colors.ink3} />
            </Pressable>
          ) : null}
        </View>
      </View>
      <CommunityDirectory search={search} header={header} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
  head: { paddingHorizontal: 20, paddingTop: 20, gap: 12 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.paper, borderRadius: radius.pill, paddingHorizontal: 16, minHeight: 44 },
  input: { flex: 1, fontFamily: fonts.body, fontSize: 16, color: colors.ink, paddingVertical: 10 },
  promises: { gap: 10, paddingVertical: 12, marginBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  promise: { flexDirection: 'row', alignItems: 'center', gap: 12 },
})
