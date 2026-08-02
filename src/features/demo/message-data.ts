/**
 * Conversations de démonstration (`nkamva-messages.js` de la maquette). Voir
 * l'avertissement en tête de `catalog-data.ts` : rien ici ne vient de la base —
 * aucun modèle de conversation n'existe. Ce que la messagerie devra trancher
 * est listé dans `docs/espace-apprenant-a-brancher.md`.
 */

import { AUTHORS, type Author } from './catalog-data'
import { COMMUNITIES, type Community } from './community-data'

export interface DemoMessage {
  id: string
  /** `them` = le formateur, `me` = l'apprenant connecté. */
  who: 'them' | 'me'
  text: string
  sentAt: Date
}

export interface Conversation {
  id: string
  trainer: Author
  community: Community
  messages: DemoMessage[]
}

function daysAgo(days: number, hour = 10): Date {
  const d = new Date(Date.now() - days * 24 * 3600 * 1000)
  d.setHours(hour, 0, 0, 0)
  return d
}

function community(slug: string): Community {
  const found = COMMUNITIES.find((c) => c.slug === slug)
  if (!found) throw new Error(`Communauté de démonstration inconnue : ${slug}`)
  return found
}

export const CONVERSATIONS: Conversation[] = [
  {
    id: 'dt',
    trainer: AUTHORS.dt,
    community: community('qa-tests-logiciels'),
    messages: [
      {
        id: 'dt-1',
        who: 'them',
        text: "Bonjour ! Merci pour votre présence au live technique. Le replay est en ligne si vous voulez revoir le passage sur les jeux de données.",
        sentAt: daysAgo(6, 9),
      },
      {
        id: 'dt-2',
        who: 'me',
        text: "Merci beaucoup. J'ai une question sur la checklist de recette : faut-il la versionner avec le code ?",
        sentAt: daysAgo(6, 14),
      },
      {
        id: 'dt-3',
        who: 'them',
        text: "Oui, dans le dépôt, à côté des tests. Une checklist qui vit ailleurs finit toujours par diverger de ce que fait vraiment l'application.",
        sentAt: daysAgo(5, 8),
      },
    ],
  },
  {
    id: 'as',
    trainer: AUTHORS.as,
    community: community('ingenierie-logicielle-afrique'),
    messages: [
      {
        id: 'as-1',
        who: 'them',
        text: "Salut ! Le replay sur l'architecture des systèmes de paiement est disponible dans la communauté, n'hésitez pas si vous avez des questions.",
        sentAt: daysAgo(12, 11),
      },
    ],
  },
  {
    id: 'yo',
    trainer: AUTHORS.yo,
    community: community('createurs-video-montage'),
    messages: [
      {
        id: 'yo-1',
        who: 'me',
        text: "Bonjour, est-ce que l'atelier montage de la semaine prochaine sera enregistré ?",
        sentAt: daysAgo(2, 16),
      },
      {
        id: 'yo-2',
        who: 'them',
        text: "Oui, comme d'habitude. Apportez vos rushs si vous en avez, on travaillera dessus en direct.",
        sentAt: daysAgo(1, 9),
      },
    ],
  },
]

export function conversationById(id: string): Conversation | undefined {
  return CONVERSATIONS.find((c) => c.id === id)
}
