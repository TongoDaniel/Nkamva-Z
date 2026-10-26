// ==========================================================================
// Dette d'atteignabilité assumée — état au 7 août 2026
// ==========================================================================
// Chaque route listée ici existe sans qu'aucun fichier de `src/` ne l'adresse.
// La lister n'est pas l'excuser : c'est la reconnaître, pour que le garde-fou
// puisse échouer sur **les prochaines** au lieu de crier en permanence.
//
// `tests/atteignabilite.test.ts` tient la liste honnête dans les deux sens :
//
//   · une route hors liste et sans appelant → échec, il faut la brancher ou
//     l'assumer ici, en écrivant pourquoi ;
//   · une entrée dont la route a disparu → échec, l'exception est morte ;
//   · une entrée devenue atteignable → échec, il faut la retirer.
//
// C'est ce troisième point qui compte le plus. Une liste d'exceptions qu'on ne
// nettoie jamais finit par viser à côté sans le dire — c'est très exactement ce
// qui est arrivé au garde-fou hermétique des tests, qui a protégé `R2_*` pendant
// des semaines alors que l'environnement fournissait `AWS_*`.
//
// Trois familles, et elles ne se valent pas.
// ==========================================================================

export interface KnownUnreachable {
  path: string
  reason: string
}

export const KNOWN_UNREACHABLE: KnownUnreachable[] = [
  // ── 0. Appelées, mais pas d'une façon que le balayeur sait lire ────────
  // Ajoutées le 26 octobre 2026. Ce ne sont pas des dettes : la première est
  // appelée de l'extérieur de l'application, la seconde par une adresse
  // composée que le balayeur textuel ne reconstitue pas.
  {
    path: '/api/health',
    reason: 'Sonde de supervision : appelée par le moniteur et le déploiement, jamais par l\'application.',
  },
  {
    path: '/api/me/avatar/confirm',
    reason: 'Appelée par AvatarPanel via `${endpoint}/confirm` : une adresse composée, que le balayeur ne lit pas.',
  },

  // ── 1. Doublons de lecture ────────────────────────────────────────────
  // L'écran est un composant serveur : il appelle la fonction de `src/lib`
  // directement, sans passer par HTTP. La route rend la même chose pour un
  // client qui n'existe pas. Sans conséquence produit — mais ce sont des portes
  // authentifiées à maintenir, à faire évoluer et à surveiller pour rien.
  {
    path: '/api/admin/disputes',
    reason: 'Doublon de lecture : /admin/litiges appelle listDisputes() côté serveur.',
  },
  {
    path: '/api/admin/disputes/stats',
    reason: 'Doublon de lecture : le tableau de bord appelle getDisputeStats() côté serveur.',
  },
  {
    path: '/api/admin/manual-refund-tasks',
    reason: 'Doublon de lecture : /admin/remboursements appelle listManualRefundTasks() côté serveur.',
  },
  {
    path: '/api/admin/payout-methods',
    reason: 'Doublon de lecture : /admin/moyens-de-paiement lit la liste côté serveur.',
  },
  {
    path: '/api/admin/payout-methods/escalations',
    reason: 'Doublon de lecture : les escalades sont lues côté serveur par le même écran.',
  },
  {
    path: '/api/admin/payouts',
    reason: 'Doublon de lecture : /admin/retraits lit la liste côté serveur.',
  },
  {
    path: '/api/admin/payouts/stats',
    reason: 'Doublon de lecture : le tableau de bord appelle getPayoutStats() côté serveur.',
  },
  {
    path: '/api/admin/trainer-applications',
    reason: 'Doublon de lecture : /admin/validation-formateurs lit la file côté serveur.',
  },
  {
    path: '/api/admin/trainer-applications/stats',
    reason: 'Doublon de lecture : la pastille de navigation appelle getApplicationStats() côté serveur.',
  },
  {
    path: '/api/catalog/courses',
    reason: 'Doublon de lecture : la vitrine et la recherche appellent searchCourses() côté serveur.',
  },
  {
    path: '/api/me/purchases',
    reason: 'Doublon de lecture : /mes-achats lit les achats côté serveur.',
  },
  {
    path: '/api/me/resources',
    reason:
      'Doublon de lecture pour la collection seule. Ses sous-routes /[courseId]/content, /download et /progress sont, elles, bien appelées.',
  },
  {
    path: '/api/trainer/disputes',
    reason: 'Doublon de lecture : l’espace formateur lit ses litiges côté serveur.',
  },
  {
    path: '/api/trainer/kyc-score',
    reason: 'Doublon de lecture : le score KYC est calculé côté serveur là où il s’affiche.',
  },
  {
    path: '/api/trainer/payouts/[payoutId]',
    reason: 'Doublon de lecture : le détail d’un versement est lu côté serveur.',
  },

  // ── 2. Écritures sans commande ────────────────────────────────────────
  // Cette famille est vide depuis le 8 août 2026 : les deux réconciliations de
  // portefeuille sont branchées sur /admin/portefeuilles. Elle reste décrite
  // parce que c'est la plus grave — une action qui modifie l'état et qu'on ne
  // peut déclencher qu'en dehors de l'application, donc sans les garde-fous de
  // l'écran ni motif lisible par le suivant. Toute nouvelle route de ce genre
  // atterrira ici, et devra en repartir.

  // ── 3. Trous produit : la fonctionnalité entière est inatteignable ────
  // Le serveur sait faire, personne ne peut le demander. C'est la famille qui a
  // motivé ce garde-fou. Chaque entrée ici doit disparaître en branchant
  // l'interface, jamais en élargissant l'exception.
  // `/api/reports` a quitté cette liste le 7 août 2026 : `ReportButton` la poste
  // depuis la fiche ressource et la fiche communauté. Restent inatteignables les
  // cibles `USER`, `MESSAGE` et `DISPUTE_MESSAGE` de l'énumération — mais la
  // route, elle, est branchée, et c'est ce que ce garde-fou surveille.
  // `/api/me/disputes/attachments/upload` a quitté cette liste le 7 août 2026 :
  // `AttachmentPicker` la présigne depuis l'ouverture d'un litige et depuis le
  // fil de réponses.
  // `/api/me/invoices/[invoiceId]` a quitté cette liste le 7 août 2026 :
  // `/mes-factures` et `/mes-achats` pointent son `?pdf=1`. La collection, elle,
  // reste un doublon — et le rester est le bon choix : rendre l'écran client
  // pour qu'il consomme sa propre API produirait un écran plus lent et moins
  // simple, dans le seul but de faire passer un contrôle. Le garde-fou est là
  // pour signaler ce qui est inatteignable, pas pour dicter l'architecture.
  {
    path: '/api/me/invoices',
    reason:
      'Doublon de lecture : /mes-factures appelle listMyInvoices() côté serveur. Candidate à la suppression — aucun client ne la réclame.',
  },
]
