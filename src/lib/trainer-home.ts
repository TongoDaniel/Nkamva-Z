// ==========================================================================
// Ce que l'accueil d'un formateur lit, en une seule vague
// ==========================================================================
// Vivait dans `accueil/page.tsx`, qui portait le tableau de bord ; il a suivi
// celui-ci dans `/formateur` (voir l'en-tête de cette page). Ici plutôt que
// dans l'écran : c'est de la donnée, et un smoke test doit pouvoir l'appeler
// sans rendre une page.
// ==========================================================================

import { countActivePaidMembers } from './communities'
import { listTrainerCourses } from './courses'
import { countUnreadMessages } from './messaging'
import { getMySubscription } from './subscriptions'
import { getTrainerStorage } from './storage-tiers'
import {
  countDisputesToContest,
  getSalesByCourse,
  getTrainerOverview,
  getTrainerWallet,
} from './trainer-stats'

/**
 * Tout ce que le tableau de bord lit du côté formateur, en une seule vague.
 *
 * Les agrégats viennent des fonctions que les pages de destination utilisent
 * déjà : l'accueil ne recompte rien, donc il ne peut pas les contredire.
 */
export async function loadTrainerPanel(trainerId: string, userId: string) {
  const [
    overview,
    wallet,
    subscription,
    storage,
    activeMembers,
    disputesToContest,
    unreadMessages,
    courses,
    sales,
  ] = await Promise.all([
    getTrainerOverview(trainerId),
    getTrainerWallet(trainerId),
    getMySubscription(trainerId),
    getTrainerStorage(trainerId),
    countActivePaidMembers(trainerId),
    countDisputesToContest(trainerId),
    countUnreadMessages(userId, trainerId),
    listTrainerCourses(trainerId),
    getSalesByCourse(trainerId),
  ]);

  return {
    overview,
    wallet,
    subscription,
    storage,
    activeMembers,
    disputesToContest,
    unreadMessages,
    courses,
    sales,
  };
}
