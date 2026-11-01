import { useRef, useState } from 'react'
import { FlatList, Image, Pressable, StyleSheet, useWindowDimensions, View, type ImageSourcePropType } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useOnboarding } from '../lib/onboarding'
import { Text } from '../ui/Text'
import { Button } from '../ui/Button'
import { colors, radius } from '../ui/theme'

interface Slide {
  key: string
  image: ImageSourcePropType
  title: string
  body: string
}

/** Les photos sont celles du site (`public/auth`, `public/formateurs.webp`), recadrées au clair. */
const SLIDES: Slide[] = [
  {
    key: 'apprendre',
    image: require('../../assets/onboarding/apprendre.jpg'),
    title: 'Des savoir-faire concrets, dans ta poche',
    body: 'Vidéos, guides et kits pratiques créés par des formateurs d’Afrique. Tu reprends là où tu t’es arrêté, sur n’importe quel appareil.',
  },
  {
    key: 'formateurs',
    image: require('../../assets/onboarding/formateurs.jpg'),
    title: 'Des formateurs vérifiés, un par un',
    body: 'Chaque formateur est validé par l’équipe NKAMVA avant de publier. Tu sais à qui tu apprends.',
  },
  {
    key: 'communautes',
    image: require('../../assets/onboarding/communautes.jpg'),
    title: 'Progresse avec les autres',
    body: 'Rejoins une communauté, pose tes questions dans le groupe et retrouve les lives de ton formateur.',
  },
]

export default function Bienvenue() {
  const { width, height } = useWindowDimensions()
  const { complete } = useOnboarding()
  const [index, setIndex] = useState(0)
  const list = useRef<FlatList<Slide>>(null)
  const last = index === SLIDES.length - 1
  const imageHeight = Math.min(height * 0.5, width * 1.05)

  /**
   * Comme Duolingo : « Découvrir » mène droit au catalogue, sans compte ; la
   * connexion reste à un geste pour qui en a déjà un. L'onboarding quitte la
   * pile dès qu'il est terminé, et l'accueil du visiteur prend sa place.
   */
  async function finish(target: 'decouvrir' | 'connexion') {
    await complete()
    if (target === 'connexion') requestAnimationFrame(() => router.push('/connexion'))
  }

  function next() {
    if (last) return
    list.current?.scrollToIndex({ index: index + 1, animated: true })
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.fill}>
      <View style={styles.top}>
        <Image source={require('../../assets/marque/marque-256.png')} style={styles.logo} />
        {!last ? (
          <Pressable onPress={() => finish('decouvrir')} hitSlop={12} accessibilityRole="button">
            <Text variant="label" style={{ color: colors.ink3 }}>Passer</Text>
          </Pressable>
        ) : null}
      </View>

      <FlatList
        ref={list}
        data={SLIDES}
        keyExtractor={(s) => s.key}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item }) => (
          <View style={{ width, paddingHorizontal: 20, gap: 22 }}>
            <Image source={item.image} style={[styles.image, { height: imageHeight }]} resizeMode="cover" accessibilityIgnoresInvertColors />
            <View style={{ gap: 10 }}>
              <Text variant="display" style={{ fontSize: 28, lineHeight: 34 }}>{item.title}</Text>
              <Text variant="body">{item.body}</Text>
            </View>
          </View>
        )}
      />

      <View style={styles.bottom}>
        <View style={styles.dots} accessibilityLabel={`Étape ${index + 1} sur ${SLIDES.length}`}>
          {SLIDES.map((s, i) => (
            <View key={s.key} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
        {last ? (
          <View style={{ gap: 10 }}>
            <Button label="Découvrir NKAMVA" onPress={() => finish('decouvrir')} />
            <Button label="J’ai déjà un compte" tone="secondary" onPress={() => finish('connexion')} />
          </View>
        ) : (
          <Button label="Suivant" onPress={next} />
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  logo: { width: 36, height: 36, borderRadius: 9 },
  image: { width: '100%', borderRadius: radius.lg, backgroundColor: colors.paper },
  bottom: { paddingHorizontal: 20, paddingBottom: 12, gap: 18 },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.line },
  dotActive: { width: 24, backgroundColor: colors.brand },
})
