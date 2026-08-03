import { redirect } from 'next/navigation'

/**
 * `/mon-compte` était l'écran de compte du socle, écrit avant que l'espace
 * connecté n'existe. `/profil` le remplace entièrement — informations, mot de
 * passe, export et suppression des données — dans le shell applicatif.
 *
 * L'ancienne URL est gardée en redirection plutôt que supprimée : elle a été
 * diffusée (liens d'e-mails, favoris, `callbackUrl` de sessions ouvertes) et
 * une 404 sur « mon compte » est le pire accueil possible après une connexion.
 */
export default function MonComptePage() {
  redirect('/profil')
}
