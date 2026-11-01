import { useEffect, useState } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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
import { ApiError } from '../lib/api'
import { colors, fonts } from '../ui/theme'

SplashScreen.preventAutoHideAsync().catch(() => {})

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Un refus du serveur (403, 404) ne se corrige pas en réessayant ;
        // une coupure réseau, si.
        retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
      },
    },
  })
}

function RootNavigator() {
  const { status } = useAuth()
  const { done: onboarded } = useOnboarding()
  const ready = status !== 'loading' && onboarded !== null

  // L'écran de démarrage reste affiché jusqu'à ce que la session et
  // l'onboarding soient connus : pas de flash d'un écran qu'on quitte aussitôt.
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {})
  }, [ready])

  if (!ready) return null
  const signedIn = status === 'signedIn'

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
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(onglets)" options={{ headerShown: false }} />
        <Stack.Screen name="ressource/[slug]" options={{ title: '' }} />
        <Stack.Screen name="lecteur/[courseId]" options={{ title: '' }} />
        <Stack.Screen name="conversation/[id]" options={{ title: '' }} />
        <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="lives" options={{ title: 'Lives à venir' }} />
        <Stack.Screen name="communautes" options={{ title: 'Mes communautés' }} />
        <Stack.Screen name="profil" options={{ title: 'Mon profil' }} />
        <Stack.Screen name="mot-de-passe" options={{ title: 'Mot de passe' }} />
        <Stack.Screen name="communaute/[slug]" options={{ title: '' }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn && !onboarded}>
        <Stack.Screen name="bienvenue" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="connexion" options={{ headerShown: false }} />
        <Stack.Screen name="inscription" options={{ title: 'Créer un compte' }} />
        <Stack.Screen name="verifier-code" options={{ title: 'Vérifier mon adresse' }} />
        <Stack.Screen name="mot-de-passe-oublie" options={{ title: 'Mot de passe oublié' }} />
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
        <QueryClientProvider client={queryClient}>
          <OnboardingProvider>
            <AuthProvider>
              <StatusBar style="dark" />
              <RootNavigator />
            </AuthProvider>
          </OnboardingProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
