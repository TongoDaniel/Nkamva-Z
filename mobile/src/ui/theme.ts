/**
 * Jetons de marque, repris de `src/app/globals.css` (site web). Une teinte
 * changée là-bas se change ici : l'app et le site doivent rester une seule
 * marque.
 */
export const colors = {
  background: '#ffffff',
  paper: '#f6f3ec',
  card: '#ffffff',
  ink: '#15211b',
  ink2: '#4c5a52',
  ink3: '#626e69',
  hairline: '#84908a',
  line: '#e4dfd2',
  line2: '#eeeadf',

  brand: '#1c5ed0',
  brandTint: '#e7effb',
  navy: '#022342',
  azure: '#2e7cf6',

  clay: '#c05f21',
  clayInk: '#9c4713',
  clayTint: '#f8e8dc',
  gold: '#b98a12',
  goldInk: '#7d5c05',
  goldTint: '#f7eed6',
  danger: '#b3402e',
  dangerTint: '#f9e7e3',
  info: '#2b5fa8',
  infoTint: '#e4edf8',
  success: '#0d6b4d',
  successTint: '#e2f1ea',
} as const

export const radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const

/** Bricolage Grotesque pour les titres, Instrument Sans pour le texte. */
export const fonts = {
  display: 'BricolageGrotesque_700Bold',
  displayMedium: 'BricolageGrotesque_600SemiBold',
  body: 'InstrumentSans_400Regular',
  bodyMedium: 'InstrumentSans_500Medium',
  bodySemi: 'InstrumentSans_600SemiBold',
  bodyBold: 'InstrumentSans_700Bold',
} as const

export const shadow = {
  sm: {
    shadowColor: '#15211b',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  md: {
    shadowColor: '#15211b',
    shadowOpacity: 0.09,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
} as const
