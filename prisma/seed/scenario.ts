// ==========================================================================
// Le scénario : ce qui s'est passé sur la plateforme
// ==========================================================================
// Encore des données, mais des données d'**événements** — qui a acheté, qui a
// contesté, qui a été payé. Elles sont séparées du catalogue parce qu'elles
// s'en servent : une ligne d'ici référence toujours une clé de `data.ts`.
//
// Le fil conducteur, pour que le jeu reste lisible quand on le fait évoluer :
//
//   · Awa Sarr est la vitrine. Dossier KYC complet, un retrait déjà versé, un
//     second en revue, une communauté vivante. C'est chez elle qu'on regarde
//     à quoi ressemble l'espace formateur quand tout fonctionne.
//   · Yao Kouassi porte le litige en cours, Moussa Traoré le remboursement
//     déjà décidé. Aucun des deux n'est chez Awa : un litige ouvert ferait
//     tomber son score KYC de 100 à 90, et son second retrait ne serait plus
//     auto-approuvable.
//   · Kofi Mensah est en impayé d'abonnement, Nadège Bidias vient d'arriver
//     et n'a rien publié. Les deux états qu'on ne voit jamais autrement.
// ==========================================================================

// --- Achats ----------------------------------------------------------------

export interface PurchaseSeed {
  /** Référence provider — sert de clé stable dans tout le scénario. */
  ref: string
  courseKey: string
  learnerKey: string
  provider: 'STRIPE' | 'PAWAPAY'
  daysAgo: number
  /**
   * `SUCCEEDED` passe par le crédit du portefeuille, comme le webhook.
   * `PENDING` reste un tunnel abandonné, `FAILED` un paiement refusé —
   * les deux nourrissent /admin/transactions, qu'un jeu tout vert laisserait
   * croire infaillible.
   */
  outcome?: 'SUCCEEDED' | 'PENDING' | 'FAILED'
}

export const PURCHASES: PurchaseSeed[] = [
  // Awa Sarr — le formateur le plus vendu
  { ref: 'seed_tx_01', courseKey: 'hexagonale', learnerKey: 'aminata', provider: 'PAWAPAY', daysAgo: 88 },
  { ref: 'seed_tx_02', courseKey: 'hexagonale', learnerKey: 'ibrahim', provider: 'STRIPE', daysAgo: 74 },
  // Contesté puis rejeté : l'achat doit rester dans la fenêtre de 14 jours,
  // sinon `openDispute` refuse d'ouvrir le dossier (décision 18).
  { ref: 'seed_tx_03', courseKey: 'hexagonale', learnerKey: 'jean', provider: 'PAWAPAY', daysAgo: 13 },
  { ref: 'seed_tx_04', courseKey: 'hexagonale', learnerKey: 'malick', provider: 'PAWAPAY', daysAgo: 9 },
  { ref: 'seed_tx_05', courseKey: 'tests-ci', learnerKey: 'aminata', provider: 'PAWAPAY', daysAgo: 62 },
  { ref: 'seed_tx_06', courseKey: 'tests-ci', learnerKey: 'nadia', provider: 'STRIPE', daysAgo: 44 },
  { ref: 'seed_tx_07', courseKey: 'tests-ci', learnerKey: 'seydou', provider: 'PAWAPAY', daysAgo: 20 },
  { ref: 'seed_tx_08', courseKey: 'revue-code', learnerKey: 'ibrahim', provider: 'PAWAPAY', daysAgo: 40 },
  { ref: 'seed_tx_09', courseKey: 'revue-code', learnerKey: 'esther', provider: 'STRIPE', daysAgo: 14 },
  { ref: 'seed_tx_10', courseKey: 'pipelines', learnerKey: 'seydou', provider: 'STRIPE', daysAgo: 17 },
  { ref: 'seed_tx_11', courseKey: 'pipelines', learnerKey: 'aminata', provider: 'PAWAPAY', daysAgo: 6 },
  { ref: 'seed_tx_12', courseKey: 'pipelines', learnerKey: 'malick', provider: 'PAWAPAY', daysAgo: 2 },

  // Moussa Traoré
  { ref: 'seed_tx_13', courseKey: 'ohada-societe', learnerKey: 'nadia', provider: 'PAWAPAY', daysAgo: 66 },
  { ref: 'seed_tx_14', courseKey: 'ohada-societe', learnerKey: 'omar', provider: 'PAWAPAY', daysAgo: 47 },
  { ref: 'seed_tx_15', courseKey: 'ohada-societe', learnerKey: 'clarisse', provider: 'STRIPE', daysAgo: 24 },
  { ref: 'seed_tx_16', courseKey: 'kit-ohada', learnerKey: 'omar', provider: 'STRIPE', daysAgo: 45 },
  { ref: 'seed_tx_17', courseKey: 'kit-ohada', learnerKey: 'esther', provider: 'PAWAPAY', daysAgo: 11 },
  // Contestée puis remboursée : voir DISPUTES.
  { ref: 'seed_tx_18', courseKey: 'tresorerie', learnerKey: 'clarisse', provider: 'PAWAPAY', daysAgo: 12 },

  // Fatou Ndiaye
  { ref: 'seed_tx_19', courseKey: 'whatsapp', learnerKey: 'rita', provider: 'PAWAPAY', daysAgo: 10 },
  { ref: 'seed_tx_20', courseKey: 'whatsapp', learnerKey: 'clarisse', provider: 'STRIPE', daysAgo: 29 },
  { ref: 'seed_tx_21', courseKey: 'whatsapp', learnerKey: 'jean', provider: 'PAWAPAY', daysAgo: 8 },
  { ref: 'seed_tx_22', courseKey: 'notion-marketing', learnerKey: 'rita', provider: 'PAWAPAY', daysAgo: 13 },
  { ref: 'seed_tx_23', courseKey: 'notion-marketing', learnerKey: 'nadia', provider: 'STRIPE', daysAgo: 4 },
  // Achetée avant son retrait du catalogue : l'accès de l'acheteuse survit.
  { ref: 'seed_tx_24', courseKey: 'pub-express', learnerKey: 'esther', provider: 'PAWAPAY', daysAgo: 26 },

  // Yao Kouassi
  { ref: 'seed_tx_25', courseKey: 'montage', learnerKey: 'jean', provider: 'STRIPE', daysAgo: 36 },
  { ref: 'seed_tx_26', courseKey: 'montage', learnerKey: 'seydou', provider: 'PAWAPAY', daysAgo: 21 },
  { ref: 'seed_tx_27', courseKey: 'identite', learnerKey: 'rita', provider: 'STRIPE', daysAgo: 10 },
  // Litige en cours : achat récent, ressource non téléchargée.
  { ref: 'seed_tx_28', courseKey: 'identite', learnerKey: 'aminata', provider: 'STRIPE', daysAgo: 5 },

  // Kofi Mensah
  { ref: 'seed_tx_29', courseKey: 'tableaux-bord', learnerKey: 'clarisse', provider: 'PAWAPAY', daysAgo: 34 },
  { ref: 'seed_tx_30', courseKey: 'tableaux-bord', learnerKey: 'omar', provider: 'STRIPE', daysAgo: 15 },
  { ref: 'seed_tx_31', courseKey: 'budget-annuel', learnerKey: 'clarisse', provider: 'PAWAPAY', daysAgo: 7 },

  // Paiements qui n'ont pas abouti.
  { ref: 'seed_tx_32', courseKey: 'hexagonale', learnerKey: 'esther', provider: 'PAWAPAY', daysAgo: 3, outcome: 'PENDING' },
  { ref: 'seed_tx_33', courseKey: 'tableaux-bord', learnerKey: 'malick', provider: 'STRIPE', daysAgo: 5, outcome: 'FAILED' },
  { ref: 'seed_tx_34', courseKey: 'montage', learnerKey: 'grace', provider: 'PAWAPAY', daysAgo: 18, outcome: 'FAILED' },
]

// --- Adhésions aux communautés ---------------------------------------------

export interface MembershipSeed {
  communityKey: string
  learnerKey: string
  provider: 'STRIPE' | 'PAWAPAY'
  /** Ancienneté de l'adhésion, en jours. */
  daysAgo: number
  /** Résiliée : l'accès court jusqu'à la fin de la période déjà réglée. */
  canceled?: boolean
  /** Bannie du salon par l'animateur. */
  banned?: { reason: string }
}

export const MEMBERSHIPS: MembershipSeed[] = [
  { communityKey: 'atelier-code', learnerKey: 'aminata', provider: 'PAWAPAY', daysAgo: 96 },
  { communityKey: 'atelier-code', learnerKey: 'ibrahim', provider: 'PAWAPAY', daysAgo: 71 },
  { communityKey: 'atelier-code', learnerKey: 'seydou', provider: 'STRIPE', daysAgo: 52 },
  { communityKey: 'atelier-code', learnerKey: 'nadia', provider: 'PAWAPAY', daysAgo: 38 },
  { communityKey: 'atelier-code', learnerKey: 'malick', provider: 'STRIPE', daysAgo: 9 },
  { communityKey: 'atelier-code', learnerKey: 'jean', provider: 'PAWAPAY', daysAgo: 60, canceled: true },
  {
    communityKey: 'atelier-code',
    learnerKey: 'blaise',
    provider: 'PAWAPAY',
    daysAgo: 33,
    banned: {
      reason: "Insultes envers un autre membre dans le fil « migrations », après un rappel resté sans effet.",
    },
  },
  { communityKey: 'cercle-ohada', learnerKey: 'clarisse', provider: 'PAWAPAY', daysAgo: 63 },
  { communityKey: 'cercle-ohada', learnerKey: 'omar', provider: 'STRIPE', daysAgo: 41 },
  { communityKey: 'cercle-ohada', learnerKey: 'esther', provider: 'PAWAPAY', daysAgo: 16 },
  { communityKey: 'studio-yao', learnerKey: 'rita', provider: 'STRIPE', daysAgo: 44 },
]

// --- Invitations -----------------------------------------------------------

export interface InvitationSeed {
  communityKey: string
  /** NOMINATIVE : adressée à une personne. SHARE_LINK : lien de parrainage. */
  kind: 'NOMINATIVE' | 'SHARE_LINK'
  grant: 'GIFT' | 'PAID'
  /** Clé d'un apprenant du jeu, ou une adresse libre pour un inconnu. */
  inviteeKey?: string
  inviteeEmail?: string
  giftMonths?: number
  /** L'invité l'accepte-t-il pendant le scénario ? GIFT uniquement. */
  accepted?: boolean
  /** Révoquée par l'animateur après émission. */
  revoked?: boolean
}

export const INVITATIONS: InvitationSeed[] = [
  // Deux mois offerts, acceptés : l'adhésion existe sans avoir rien coûté.
  {
    communityKey: 'atelier-code',
    kind: 'NOMINATIVE',
    grant: 'GIFT',
    inviteeKey: 'esther',
    giftMonths: 2,
    accepted: true,
  },
  // Adressée à quelqu'un qui n'a pas encore de compte : elle attend.
  {
    communityKey: 'atelier-code',
    kind: 'NOMINATIVE',
    grant: 'PAID',
    inviteeEmail: 'binta.camara@exemple.sn',
  },
  // Lien de parrainage vivant, à recopier.
  { communityKey: 'atelier-code', kind: 'SHARE_LINK', grant: 'PAID' },
  // Émise puis retirée : montre l'état « révoquée » dans la liste.
  {
    communityKey: 'cercle-ohada',
    kind: 'NOMINATIVE',
    grant: 'GIFT',
    inviteeKey: 'malick',
    giftMonths: 1,
    revoked: true,
  },
  // Une communauté privée ne s'entre qu'au nominatif (arbitrage 74).
  {
    communityKey: 'studio-yao',
    kind: 'NOMINATIVE',
    grant: 'PAID',
    inviteeKey: 'jean',
  },
]

// --- Progression de lecture ------------------------------------------------

export interface ViewSeed {
  courseKey: string
  learnerKey: string
  watchedSeconds?: number
  downloaded?: boolean
  daysAgo: number
}

export const VIEWS: ViewSeed[] = [
  // Aminata : trois ressources en cours, dont une presque finie. C'est elle
  // qui donne son relief au tableau de bord apprenant.
  { courseKey: 'hexagonale', learnerKey: 'aminata', watchedSeconds: 11200, daysAgo: 2 },
  { courseKey: 'tests-ci', learnerKey: 'aminata', watchedSeconds: 3600, daysAgo: 6 },
  { courseKey: 'pipelines', learnerKey: 'aminata', watchedSeconds: 1800, daysAgo: 1 },
  { courseKey: 'identite', learnerKey: 'aminata', downloaded: false, daysAgo: 4 },

  { courseKey: 'hexagonale', learnerKey: 'ibrahim', watchedSeconds: 12600, daysAgo: 12 },
  { courseKey: 'revue-code', learnerKey: 'ibrahim', downloaded: true, daysAgo: 30 },
  { courseKey: 'tests-ci', learnerKey: 'nadia', watchedSeconds: 5400, daysAgo: 8 },
  { courseKey: 'ohada-societe', learnerKey: 'nadia', downloaded: true, daysAgo: 40 },
  { courseKey: 'pipelines', learnerKey: 'seydou', watchedSeconds: 9000, daysAgo: 3 },
  { courseKey: 'montage', learnerKey: 'seydou', watchedSeconds: 2400, daysAgo: 14 },
  { courseKey: 'ohada-societe', learnerKey: 'omar', downloaded: true, daysAgo: 42 },
  { courseKey: 'kit-ohada', learnerKey: 'omar', downloaded: true, daysAgo: 39 },
  { courseKey: 'tableaux-bord', learnerKey: 'omar', watchedSeconds: 3300, daysAgo: 5 },
  // Bloquée à la leçon 6 — c'est l'objet de son litige. Moins de 30 % consulté,
  // sans quoi l'ouverture du dossier serait refusée (décision 14).
  { courseKey: 'whatsapp', learnerKey: 'rita', watchedSeconds: 2400, daysAgo: 4 },
  { courseKey: 'notion-marketing', learnerKey: 'rita', downloaded: true, daysAgo: 9 },
  { courseKey: 'montage', learnerKey: 'jean', watchedSeconds: 7200, daysAgo: 7 },
  { courseKey: 'whatsapp', learnerKey: 'clarisse', watchedSeconds: 4200, daysAgo: 22 },
  { courseKey: 'tableaux-bord', learnerKey: 'clarisse', watchedSeconds: 9900, daysAgo: 10 },
  // Contestée pour contenu non conforme : la ressource n'a pas été téléchargée,
  // sans quoi l'ouverture du litige serait refusée (décision 14).
  { courseKey: 'tresorerie', learnerKey: 'clarisse', downloaded: false, daysAgo: 11 },
]

// --- Favoris ---------------------------------------------------------------

export const FAVORITE_COURSES: Array<{ learnerKey: string; courseKey: string }> = [
  { learnerKey: 'aminata', courseKey: 'tableaux-bord' },
  { learnerKey: 'aminata', courseKey: 'revue-code' },
  { learnerKey: 'aminata', courseKey: 'montage' },
  { learnerKey: 'malick', courseKey: 'tests-ci' },
  { learnerKey: 'malick', courseKey: 'whatsapp' },
  { learnerKey: 'esther', courseKey: 'ohada-societe' },
  { learnerKey: 'clarisse', courseKey: 'budget-annuel' },
]

export const FAVORITE_COMMUNITIES: Array<{ learnerKey: string; communityKey: string }> = [
  { learnerKey: 'aminata', communityKey: 'cercle-ohada' },
  { learnerKey: 'malick', communityKey: 'atelier-code' },
  { learnerKey: 'esther', communityKey: 'atelier-code' },
]

// --- Litiges ---------------------------------------------------------------

export interface DisputeSeed {
  key: string
  /** Référence de l'achat contesté. */
  purchaseRef: string
  reason: 'CONTENT_MISMATCH' | 'DOUBLE_CHARGE' | 'ACCESS_ISSUE' | 'UNAUTHORIZED_CHARGE' | 'OTHER'
  reasonDetail: string
  /** État visé à la fin du scénario. */
  outcome: 'OPEN' | 'WAITING_LEARNER' | 'IN_REVIEW' | 'REFUNDED' | 'REJECTED'
  /** Question du support, pour `WAITING_LEARNER`. */
  supportQuestion?: string
  /** Échange versé au dossier, pour `IN_REVIEW`. */
  supportMessage?: string
  learnerReply?: string
  /** Motivation de la décision, pour `REFUNDED` et `REJECTED`. */
  resolutionNote?: string
  /** Le formateur transmet des éléments à la Modération. */
  trainerContest?: string
}

export const DISPUTES: DisputeSeed[] = [
  // Dossier fraîchement ouvert, que personne n'a encore pris en charge. Sans
  // lui, l'onglet d'accueil de la console d'arbitrage — « à prendre » — serait
  // vide, et c'est le premier écran que voit la Modération en arrivant.
  {
    key: 'identite-rita',
    purchaseRef: 'seed_tx_27',
    reason: 'DOUBLE_CHARGE',
    reasonDetail:
      "J'ai été débitée deux fois du même montant à quelques minutes d'intervalle. Je n'ai la ressource qu'une fois dans mon espace.",
    outcome: 'OPEN',
  },
  {
    key: 'identite-aminata',
    purchaseRef: 'seed_tx_28',
    reason: 'CONTENT_MISMATCH',
    reasonDetail:
      "La fiche annonce des gabarits de publication pour les réseaux. Le fichier téléchargé ne contient que les palettes et l'échelle typographique — aucun gabarit.",
    outcome: 'WAITING_LEARNER',
    supportQuestion:
      "Bonjour, merci pour votre signalement. Pouvez-vous préciser quels gabarits étaient annoncés sur la fiche au moment de votre achat ? Une capture d'écran suffit.",
    trainerContest:
      "Les gabarits sont dans le second dossier de l'archive, nommé « social ». Je reconnais que la fiche ne le dit pas clairement et je vais la corriger.",
  },
  {
    key: 'whatsapp-rita',
    purchaseRef: 'seed_tx_19',
    reason: 'ACCESS_ISSUE',
    reasonDetail:
      "Depuis trois jours, la lecture s'arrête à la leçon 6 avec un message d'erreur. J'ai essayé sur téléphone et sur ordinateur.",
    outcome: 'IN_REVIEW',
    supportMessage:
      "Bonjour, nous avons reproduit le blocage et transmis le cas au formateur. Nous revenons vers vous sous 48 heures.",
    learnerReply: "Merci. Je précise que les leçons 1 à 5 se lisent normalement.",
  },
  {
    key: 'tresorerie-clarisse',
    purchaseRef: 'seed_tx_18',
    reason: 'CONTENT_MISMATCH',
    reasonDetail:
      "Le tableur annoncé « prêt à remplir » arrive verrouillé en lecture seule et sans les formules. Il est inutilisable en l'état.",
    outcome: 'REFUNDED',
    resolutionNote:
      "Le fichier livré est effectivement protégé et amputé de ses formules : il ne correspond pas à la description. Remboursement intégral accordé, la part formateur est débitée.",
  },
  {
    key: 'hexagonale-jean',
    purchaseRef: 'seed_tx_03',
    reason: 'OTHER',
    reasonDetail: "Le cours est plus difficile que ce à quoi je m'attendais, je voudrais être remboursé.",
    outcome: 'REJECTED',
    resolutionNote:
      "La ressource correspond à sa description et annonce un niveau intermédiaire sur sa fiche. Le niveau perçu ne constitue pas un motif de remboursement. L'accès est rétabli.",
  },
]

// --- Signalements ----------------------------------------------------------

export interface ReportSeed {
  key: string
  reporterKey: string
  targetType: 'COURSE' | 'USER' | 'COMMUNITY'
  /** Clé de la cible, selon `targetType`. */
  targetKey: string
  reason: 'ILLEGAL' | 'MISLEADING' | 'HARASSMENT' | 'SPAM' | 'INTELLECTUAL_PROPERTY' | 'OTHER'
  detail: string
  outcome: 'OPEN' | 'UPHELD' | 'DISMISSED'
  decisionNote?: string
  /** Retire la ressource du catalogue. `COURSE` uniquement. */
  hideTarget?: boolean
}

export const REPORTS: ReportSeed[] = [
  {
    key: 'pub-express',
    reporterKey: 'esther',
    targetType: 'COURSE',
    targetKey: 'pub-express',
    reason: 'MISLEADING',
    detail:
      "Le titre promet de doubler ses ventes en sept jours et la fiche parle de « résultat garanti ». Rien dans le contenu ne justifie ce chiffre.",
    outcome: 'UPHELD',
    hideTarget: true,
    decisionNote:
      "Signalement retenu. La promesse de résultat chiffrée contrevient aux conditions d'utilisation, qui interdisent toute garantie de rendement. La ressource est retirée du catalogue ; les personnes qui l'ont achetée conservent leur accès.",
  },
  {
    key: 'blaise-forum',
    reporterKey: 'ibrahim',
    targetType: 'USER',
    targetKey: 'blaise',
    reason: 'HARASSMENT',
    detail:
      "Ce membre répond systématiquement de façon agressive dans le forum de l'Atelier, y compris à des débutants qui posent une première question.",
    outcome: 'UPHELD',
    decisionNote:
      "Signalement retenu après relecture du fil. Le compte est restreint : il conserve l'accès à ses ressources mais ne peut plus écrire dans les espaces communautaires.",
  },
  {
    key: 'kit-ohada-pi',
    reporterKey: 'omar',
    targetType: 'COURSE',
    targetKey: 'kit-ohada',
    reason: 'INTELLECTUAL_PROPERTY',
    detail: "Les modèles de statuts ressemblent beaucoup à ceux d'un cabinet d'Abidjan.",
    outcome: 'DISMISSED',
    decisionNote:
      "Après vérification, les modèles reprennent des mentions légales imposées par l'Acte uniforme OHADA, qui ne sont protégeables par personne. Aucune reprise de rédaction propriétaire n'a été constatée.",
  },
  {
    key: 'atelier-spam',
    reporterKey: 'seydou',
    targetType: 'COMMUNITY',
    targetKey: 'atelier-code',
    reason: 'SPAM',
    detail: "Des offres d'emploi sont publiées dans le forum alors que le règlement du salon l'interdit.",
    outcome: 'OPEN',
  },
]

// --- Portefeuilles et retraits ---------------------------------------------

export interface PayoutMethodSeed {
  trainerKey: string
  type: 'MOBILE_MONEY' | 'BANK_IBAN'
  accountNature: 'INDIVIDUAL' | 'BUSINESS'
  mobileOperator?: 'WAVE' | 'ORANGE_MONEY' | 'MTN_MOMO' | 'AIRTEL_MONEY' | 'M_PESA'
  mobilePhone?: string
  iban?: string
  bic?: string
  holderName?: string
  /** Où le dossier s'arrête dans le scénario. */
  outcome: 'VERIFIED' | 'PENDING_REVIEW' | 'REJECTED'
  rejectionReason?: string
  note?: string
}

export const PAYOUT_METHODS: PayoutMethodSeed[] = [
  {
    trainerKey: 'awa',
    type: 'MOBILE_MONEY',
    accountNature: 'INDIVIDUAL',
    mobileOperator: 'WAVE',
    mobilePhone: '+221770000101',
    holderName: 'Awa Sarr',
    outcome: 'VERIFIED',
    note: "Nom du compte Wave conforme à la pièce d'identité. Vérifié par relevé fourni par la formatrice.",
  },
  {
    trainerKey: 'moussa',
    type: 'MOBILE_MONEY',
    accountNature: 'INDIVIDUAL',
    mobileOperator: 'ORANGE_MONEY',
    mobilePhone: '+225070000102',
    holderName: 'Moussa Traoré',
    outcome: 'VERIFIED',
    note: 'Vérification manuelle Finances, pièce et attestation opérateur concordantes.',
  },
  {
    trainerKey: 'fatou',
    type: 'BANK_IBAN',
    accountNature: 'INDIVIDUAL',
    iban: 'SN08SN0100152000048500003035',
    bic: 'BSICSNDA',
    holderName: 'Fatou Ndiaye',
    outcome: 'PENDING_REVIEW',
  },
  {
    trainerKey: 'yao',
    type: 'MOBILE_MONEY',
    accountNature: 'INDIVIDUAL',
    mobileOperator: 'MTN_MOMO',
    mobilePhone: '+225050000999',
    holderName: 'Kouassi Yao Marcel',
    outcome: 'REJECTED',
    rejectionReason:
      "Le numéro déclaré est enregistré au nom d'un tiers selon l'attestation fournie. Un compte mobile money de retrait doit être au nom du formateur.",
  },
]

export interface PayoutSeed {
  trainerKey: string
  amountFcfa: number
  /**
   * `PAID` : instruit puis versé. `REJECTED` : refusé par Finances.
   * `IN_FLIGHT` : laissé là où `requestPayout` l'a mis — ce peut être
   * `IN_REVIEW` ou `AUTO_APPROVED` selon le score KYC du formateur et le rang
   * du retrait. On ne force pas l'état : c'est justement cette bifurcation
   * (décision 25) qu'il faut pouvoir observer.
   */
  outcome: 'PAID' | 'IN_FLIGHT' | 'REJECTED'
  providerReference?: string
  note?: string
  rejectionReason?: string
}

export const PAYOUTS: PayoutSeed[] = [
  {
    trainerKey: 'awa',
    amountFcfa: 60000,
    outcome: 'PAID',
    providerReference: 'WAVE-2026-07-118432',
    note: "Premier retrait — revue obligatoire (décision 25). Pièce et compte concordants.",
  },
  // Second retrait d'Awa : son score KYC est à 100 et ce n'est plus son premier
  // versement, il devrait donc partir en auto-approbation, sans revue.
  { trainerKey: 'awa', amountFcfa: 25000, outcome: 'IN_FLIGHT' },
  {
    trainerKey: 'moussa',
    amountFcfa: 45000,
    outcome: 'REJECTED',
    rejectionReason:
      "La pièce d'identité au dossier a expiré le mois dernier. Merci de déposer un titre en cours de validité depuis votre espace : le retrait pourra être represené aussitôt.",
  },
  // Moussa redemande après son refus. Aucun versement n'a jamais abouti pour
  // lui : la décision 25 impose donc la revue manuelle, quel que soit son
  // score. C'est ce dossier qui remplit l'onglet « à instruire » de Finances,
  // le premier écran de la console des retraits.
  { trainerKey: 'moussa', amountFcfa: 30000, outcome: 'IN_FLIGHT' },
  // Fatou n'a pas de moyen vérifié : aucun retrait n'est possible pour elle,
  // et c'est l'écran « vous ne pouvez pas encore retirer » qu'on veut voir.
]

// --- Tarification de l'abonnement formateur --------------------------------

export interface TariffSeed {
  kind: 'SUBSCRIPTION' | 'STORAGE_TIER'
  cadence: 'MONTHLY' | 'YEARLY'
  amountFcfa: number
  label: string
  /** Ancienneté de l'entrée en vigueur, en jours. */
  validFromDaysAgo: number
}

/**
 * Deux générations de tarifs, dans l'ordre : la gratuité de lancement, puis la
 * grille payante. Poser les deux montre ce que la console d'administration sait
 * faire — un tarif n'est jamais réécrit, il est borné (décision 59).
 */
export const TARIFFS: TariffSeed[] = [
  { kind: 'SUBSCRIPTION', cadence: 'MONTHLY', amountFcfa: 0, label: 'Lancement — gratuit', validFromDaysAgo: 420 },
  { kind: 'SUBSCRIPTION', cadence: 'YEARLY', amountFcfa: 0, label: 'Lancement — gratuit', validFromDaysAgo: 420 },
  { kind: 'SUBSCRIPTION', cadence: 'MONTHLY', amountFcfa: 9000, label: 'Grille 2026', validFromDaysAgo: 120 },
  { kind: 'SUBSCRIPTION', cadence: 'YEARLY', amountFcfa: 90000, label: 'Grille 2026 — deux mois offerts', validFromDaysAgo: 120 },
  { kind: 'STORAGE_TIER', cadence: 'MONTHLY', amountFcfa: 2500, label: 'Palier 50 Go', validFromDaysAgo: 120 },
  { kind: 'STORAGE_TIER', cadence: 'YEARLY', amountFcfa: 25000, label: 'Palier 50 Go', validFromDaysAgo: 120 },
]

export interface DiscountSeed {
  kind: 'CAMPAIGN' | 'TRAINER' | 'PROMO_CODE'
  label: string
  amountFcfa: number
  code?: string
  trainerKey?: string
  reason?: string
  validFromDaysAgo: number
  validUntilInDays?: number
  maxUses?: number
}

export const DISCOUNTS: DiscountSeed[] = [
  {
    kind: 'CAMPAIGN',
    label: 'Rentrée 2026 — 2 000 FCFA sur la mensualité',
    amountFcfa: 2000,
    validFromDaysAgo: 30,
    validUntilInDays: 45,
  },
  {
    kind: 'PROMO_CODE',
    label: 'Code partenaire ADEA',
    amountFcfa: 3000,
    code: 'ADEA2026',
    validFromDaysAgo: 60,
    maxUses: 50,
  },
  {
    kind: 'TRAINER',
    label: 'Remise fondatrice — Awa Sarr',
    amountFcfa: 4500,
    trainerKey: 'awa',
    reason:
      "Première formatrice publiée sur la plateforme, a relu et corrigé le parcours de publication avant son ouverture.",
    validFromDaysAgo: 90,
  },
]

// --- Réglages --------------------------------------------------------------

export const SETTINGS: Array<{ key: string; value: string; description: string }> = [
  {
    key: 'support.response_time_hours',
    value: '24',
    description: 'Délai de réponse annoncé au support, en heures ouvrées.',
  },
  {
    key: 'catalog.featured_limit',
    value: '8',
    description: "Nombre de ressources mises en avant sur la page d'accueil publique.",
  },
  {
    key: 'payouts.review_sla_hours',
    value: '48',
    description: 'Délai cible de traitement des retraits par Finances.',
  },
]
