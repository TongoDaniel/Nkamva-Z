import { useEffect, useState } from 'react'
import { Stack, router, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { CACHE_MAX_AGE, persister, shouldPersist } from '../lib/offline'
import { OfflineBanner } from '../components/OfflineBanner'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { useFonts, BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque'
import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  InstrumentSans_700Bold,
} from '@expo-google-fonts/instrument-sans'
import { AuthProvider, useAuth } from '../lib/auth'
import { OnboardingProvider, useOnboarding } from '../lib/onboarding'
import { ModeProvider, useMode } from '../lib/mode'
import { useProfile } from '../lib/queries'
import { ApiError } from '../lib/api'
import { colors, fonts } from '../ui/theme'

SplashScreen.preventAutoHideAsync().catch(() => {})

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Gardé au moins aussi longtemps que le cache disque, sinon une donnée
        // enregistrée serait jetée de la mémoire avant d'avoir pu resservir.
        gcTime: CACHE_MAX_AGE,
        // Un refus du serveur (403, 404) ne se corrige pas en réessayant ;
        // une coupure réseau, si.
        retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
      },
      // Une action (envoyer un message, enregistrer le profil) part tout de suite
      // et échoue avec un message clair sans réseau, plutôt que d'attendre en
      // silence qu'il revienne.
      mutations: { networkMode: 'always' },
    },
  })
}

function RootNavigator() {
  const { status } = useAuth()
  const { done: onboarded } = useOnboarding()
  const { mode, setMode } = useMode()
  const signedIn = status === 'signedIn'
  const profile = useProfile(signedIn)
  const ready = status !== 'loading' && onboarded !== null && mode !== null

  // Le mode formateur ne survit ni à la déconnexion ni à un compte qui n'est
  // pas (ou plus) formateur. Tant que le profil n'est pas lu, on garde le
  // choix retenu : pas de bascule visible au démarrage.
  useEffect(() => {
    if (mode !== 'trainer') return
    if (status === 'signedOut' || (profile.data && !profile.data.isTrainer)) void setMode('learner')
  }, [mode, status, profile.data, setMode])

  // L'écran de démarrage reste affiché jusqu'à ce que la session et
  // l'onboarding soient connus : pas de flash d'un écran qu'on quitte aussitôt.
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {})
  }, [ready])

  // Chaque mode a son propre écran d'accueil : à la bascule (et au démarrage
  // en mode formateur), on quitte l'onglet de l'autre mode pour le sien. Les
  // écrans partagés (une fiche, une conversation) ne bougent pas.
  const segments = useSegments() as string[]
  const studioMode = signedIn && mode === 'trainer'
  useEffect(() => {
    if (!ready || !signedIn) return
    const head = segments[0]
    if (studioMode && (head === undefined || head === '(onglets)' || head === '+not-found')) router.replace('/tableau')
    if (!studioMode && head === '(studio)') router.replace('/')
  }, [ready, signedIn, studioMode, segments])

  if (!ready) return null
  const studio = studioMode
  // Visiteur : l'onboarding est vu, aucun compte n'est ouvert. Il parcourt le
  // catalogue, les communautés et les formateurs comme sur le site ; le compte ne lui est
  // demandé qu'au moment où il en a besoin (favori, bibliothèque, messages).
  // Exiger l'inscription d'emblée fait fuir, et l'App Store le refuse
  // (règle 5.1.1(v)).
  const guest = !signedIn && !!onboarded

  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.ink,
        headerTitleStyle: { fontFamily: fonts.displayMedium, fontSize: 17 },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      {/* Une seule des deux barres d'onglets existe à la fois : basculer de
          mode retire l'une et fait apparaître l'autre. */}
      <Stack.Protected guard={(signedIn && !studio) || guest}>
        <Stack.Screen name="(onglets)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={studio}>
        <Stack.Screen name="(studio)" options={{ headerShown: false }} />
      </Stack.Protected>
      {/* Lisible sans compte : la fiche d'une ressource et celle d'une
          communauté. */}
      <Stack.Protected guard={signedIn || guest}>
        <Stack.Screen name="ressource/[slug]" options={{ title: '' }} />
        <Stack.Screen name="communaute/[slug]" options={{ title: '' }} />
        <Stack.Screen name="formateur/[id]" options={{ title: '' }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="lecteur/[courseId]" options={{ title: '' }} />
        <Stack.Screen name="conversation/[id]" options={{ title: '' }} />
        <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="lives" options={{ title: 'Agenda des lives' }} />
        <Stack.Screen name="mes-communautes" options={{ title: 'Mes communautés' }} />
        <Stack.Screen name="devenir-formateur" options={{ title: 'Devenir formateur' }} />
        <Stack.Screen name="profil" options={{ title: 'Mon profil' }} />
        <Stack.Screen name="favoris" options={{ title: 'Mes favoris' }} />
        <Stack.Screen name="mot-de-passe" options={{ title: 'Mot de passe' }} />
        <Stack.Screen name="supprimer-compte" options={{ title: '' }} />
        <Stack.Screen name="studio/ventes" options={{ title: 'Ventes' }} />
        <Stack.Screen name="studio/portefeuille" options={{ title: 'Portefeuille' }} />
        <Stack.Screen name="studio/ressource/[id]" options={{ title: '' }} />
        <Stack.Screen name="studio/programmer-live" options={{ title: 'Programmer un live', presentation: 'modal' }} />
        <Stack.Screen name="studio/communaute" options={{ title: 'Ma communauté' }} />
        <Stack.Screen name="studio/litiges" options={{ title: 'Litiges' }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn && !onboarded}>
        <Stack.Screen name="bienvenue" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="rejoindre" options={{ title: '', presentation: 'modal' }} />
        <Stack.Screen name="connexion" options={{ title: '' }} />
        <Stack.Screen name="inscription" options={{ title: '' }} />
        <Stack.Screen name="verifier-code" options={{ title: '' }} />
        <Stack.Screen name="mot-de-passe-oublie" options={{ title: '' }} />
      </Stack.Protected>
    </Stack>
  )
}

export default function RootLayout() {
  const [queryClient] = useState(makeQueryClient)
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold,
  })

  if (!fontsLoaded) return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister, maxAge: CACHE_MAX_AGE, dehydrateOptions: { shouldDehydrateQuery: shouldPersist } }}
        >
          <OnboardingProvider>
            <ModeProvider>
              <AuthProvider>
                <StatusBar style="dark" />
                <RootNavigator />
                <OfflineBanner />
              </AuthProvider>
            </ModeProvider>
          </OnboardingProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
