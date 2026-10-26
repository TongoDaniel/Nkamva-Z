// ==========================================================================
// Libellés du journal d'audit
// ==========================================================================
// Le journal écrivait ses codes bruts à l'écran : `SETTING_UPDATED`,
// `FUND_RESERVATION_DEBITED`, `CHARGEBACK_MERGED_INTO_DISPUTE`. Lisible par qui
// a écrit le code, opaque pour qui instruit un dossier — or c'est la seconde
// personne qui ouvre cet écran.
//
// Deux principes tiennent cette table :
//
// 1. **Le code reste affiché**, en second. Un journal sert à retrouver l'endroit
//    du code qui a produit la ligne ; traduire en effaçant obligerait à faire le
//    chemin inverse de tête. Le libellé explique, le code localise.
// 2. **Un code sans libellé ne casse rien.** `auditActionLabel` rend une forme
//    dégradée mais lisible plutôt que rien. Une action ajoutée demain
//    s'affichera sans qu'on ait à y penser — et l'écran signale les manques
//    plutôt que de les masquer (voir `UNLABELLED_ACTIONS` côté test).
//
// Les libellés sont au passé et sans sujet : la ligne porte déjà l'acteur. On
// écrit « Réglage modifié », pas « L'administrateur a modifié un réglage ».
// ==========================================================================

/**
 * Familles d'actions. Sert au filtrage par onglet **et** de sommaire du
 * périmètre journalisé : une famille absente ici est une famille qu'aucun
 * onglet ne sait atteindre.
 *
 * L'ordre compte : `matchGroup` retient la première famille dont un préfixe
 * s'applique, donc les préfixes les plus spécifiques passent en premier.
 */
export const AUDIT_ACTION_GROUPS: Array<{ value: string; label: string; prefixes: string[] }> = [
  { value: 'all', label: 'Toutes', prefixes: [] },
  {
    value: 'trainers',
    label: 'Formateurs',
    prefixes: ['TRAINER_APPLICATION', 'TRAINER_DOCUMENT'],
  },
  {
    // « & signalements » n'est pas cosmétique : un signalement de contenu et
    // une contestation d'achat sont deux dossiers différents, instruits par
    // deux écrans différents. Les ranger sous « Litiges » sans le dire ferait
    // chercher les signalements là où ils ne sont pas.
    value: 'disputes',
    label: 'Litiges & signalements',
    prefixes: ['DISPUTE', 'REFUND', 'DOUBLE_DEBIT', 'CHARGEBACK', 'MANUAL_REFUND_TASK', 'REPORT_'],
  },
  {
    value: 'payouts',
    label: 'Retraits',
    prefixes: ['PAYOUT'],
  },
  {
    value: 'wallets',
    label: 'Portefeuilles',
    prefixes: ['WALLET', 'FUND_RESERVATION'],
  },
  {
    value: 'purchases',
    label: 'Achats',
    prefixes: ['PURCHASE', 'INVOICE', 'PAYMENT_'],
  },
  {
    // Les adhésions aux communautés sont rangées ici, avec l'abonnement
    // formateur, et non sous « Communautés » : ce sont des échéances qui
    // prélèvent, et c'est à ce titre qu'on les cherche dans un journal.
    value: 'subscriptions',
    label: 'Abonnements',
    prefixes: ['SUBSCRIPTION', 'MEMBERSHIP'],
  },
  {
    value: 'catalog',
    label: 'Catalogue',
    prefixes: ['COURSE', 'REPLAY', 'PENDING_ATTACHMENT'],
  },
  {
    value: 'communities',
    label: 'Communautés',
    prefixes: ['COMMUNITY', 'INVITATION', 'MESSAGE_SENT', 'LIVE_'],
  },
  {
    value: 'accounts',
    label: 'Comptes & sécurité',
    prefixes: [
      'ACCOUNT_', 'ADMIN_ACCOUNT', 'ADMIN_ROLE', 'USER_', 'PASSWORD_', 'EMAIL_VERIFIED',
      'TWO_FACTOR', 'PROFILE_UPDATED', 'GDPR_', 'SUPER_ADMIN_BOOTSTRAP',
    ],
  },
  {
    // Ce que l'administration décide sur la plateforme elle-même : réglages,
    // grille tarifaire, remises, paliers de stockage. Ces lignes-là sont
    // celles qu'on relit pour répondre à « qui a changé ça, et quand ».
    value: 'platform',
    label: 'Plateforme',
    prefixes: ['SETTING_UPDATED', 'PLATFORM_TARIFF', 'PLATFORM_DISCOUNT', 'STORAGE_TIERS'],
  },
  {
    value: 'jobs',
    label: 'Tâches & intégrations',
    prefixes: [
      'SCHEDULED_JOB', 'STRIPE_', 'MUX_', 'PAWAPAY', 'WEBHOOK_',
      'NOTIFICATION_', 'CONTACT_MESSAGE',
    ],
  },
]

// ==========================================================================
// Actions
// ==========================================================================

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  // --- Comptes & sécurité ---
  USER_REGISTERED: 'Compte créé',
  USER_ROLE_CHANGED: 'Rôle modifié',
  USER_SANCTION_CHANGED: 'Sanction modifiée',
  EMAIL_VERIFIED: 'Adresse e-mail vérifiée',
  PASSWORD_CHANGED: 'Mot de passe modifié',
  PASSWORD_RESET: 'Mot de passe réinitialisé',
  PROFILE_UPDATED: 'Profil modifié',
  PROFILE_PHOTO_UPDATED: 'Photo de profil déposée',
  PROFILE_PHOTO_REMOVED: 'Photo de profil retirée',
  ACCOUNT_DELETION_REQUESTED: 'Suppression de compte demandée',
  ACCOUNT_DELETION_CANCELED: 'Suppression de compte annulée',
  ACCOUNT_PURGED: 'Compte effacé',
  GDPR_EXPORT_GENERATED: 'Export de données produit',
  TWO_FACTOR_ENABLED: 'Double authentification activée',
  TWO_FACTOR_DISABLED: 'Double authentification désactivée',
  TWO_FACTOR_RECOVERY_CODES_REGENERATED: 'Codes de secours régénérés',
  TWO_FACTOR_RECOVERY_CODE_USED: 'Code de secours utilisé',
  ADMIN_ACCOUNT_CREATED: 'Compte administrateur ouvert',
  ADMIN_ACCOUNT_DEACTIVATED: 'Compte administrateur suspendu',
  ADMIN_ACCOUNT_REACTIVATED: 'Compte administrateur réactivé',
  ADMIN_ROLE_CHANGED: 'Sous-rôle administrateur modifié',
  SUPER_ADMIN_BOOTSTRAPPED: 'Super-admin initialisé au démarrage',
  SUPER_ADMIN_BOOTSTRAP_UPDATED: 'Super-admin mis à jour au démarrage',

  // --- Formateurs ---
  TRAINER_APPLICATION_CREATED: 'Candidature ouverte',
  TRAINER_APPLICATION_SUBMITTED: 'Candidature déposée',
  TRAINER_APPLICATION_APPROVED: 'Candidature acceptée',
  TRAINER_APPLICATION_REJECTED: 'Candidature refusée',
  TRAINER_APPLICATION_REOPENED: 'Candidature rouverte',
  TRAINER_APPLICATION_DOCUMENTS_REJECTED: 'Pièces refusées',
  TRAINER_DOCUMENT_UPLOAD_REQUESTED: 'Dépôt de pièce demandé',
  TRAINER_DOCUMENT_CONFIRMED: 'Pièce reçue',
  TRAINER_DOCUMENT_RESUBMITTED: 'Pièce redéposée',
  TRAINER_DOCUMENT_VIEW: "Pièce d'identité consultée",
  TRAINER_DOCUMENT_PURGED: 'Pièce effacée',

  // --- Catalogue ---
  COURSE_CREATED: 'Ressource créée',
  COURSE_UPDATED: 'Ressource modifiée',
  COURSE_PUBLISHED: 'Ressource publiée',
  COURSE_DOWNLOADED: 'Ressource téléchargée',
  COURSE_COVER_UPLOADED: 'Couverture envoyée',
  COURSE_CONTENT_UPLOADED: 'Contenu envoyé',
  COURSE_CONTENT_DELETED: 'Contenu supprimé',
  COURSE_OBLIGATION_REVISED: 'Contenu sous obligation revu',
  REPLAY_READY: 'Rediffusion prête',
  REPLAY_FAILED: 'Rediffusion en échec',
  REPLAY_PURGED: 'Rediffusion effacée',
  STORAGE_TIERS_CHANGED: 'Palier de stockage modifié',
  PENDING_ATTACHMENT_EXPIRED: 'Pièce jointe expirée',

  // --- Achats & facturation ---
  PURCHASE_INITIATED: 'Achat engagé',
  PURCHASE_SUCCEEDED: 'Achat confirmé',
  PURCHASE_FAILED: 'Achat en échec',
  PURCHASE_OPEN_FAILED: "Ouverture d'accès en échec",
  PURCHASE_RECONCILED: 'Achat rapproché',
  PAYMENT_REJECTED: 'Paiement refusé',
  PAYMENT_SIMULATED: 'Paiement simulé (développement)',
  INVOICE_ISSUED: 'Facture émise',
  INVOICE_ISSUE_FAILED: "Émission de facture en échec",

  // --- Portefeuilles ---
  WALLET_AUTO_CREATED: 'Portefeuille ouvert automatiquement',
  WALLET_RECONCILED: 'Portefeuille rapproché',
  WALLET_BALANCE_MISMATCH: 'Écart de solde constaté',
  WALLET_NEGATIVE_ALERT: 'Solde négatif signalé',
  SUBSCRIPTION_CHARGE_DEBITED: 'Échéance prélevée sur le solde',
  SUBSCRIPTION_CANCELED: 'Abonnement résilié',
  SUBSCRIPTION_RESUMED: 'Résiliation annulée',
  SUBSCRIPTION_ENDED: 'Abonnement arrivé à son terme',
  TRAINER_SPACE_CLOSED: 'Espace formateur clôturé',
  SUBSCRIPTION_PREFERENCES_UPDATED: "Réglages d'abonnement modifiés",
  SUBSCRIPTION_PAYMENT_OPENED: "Règlement d'abonnement engagé",
  SUBSCRIPTION_PAYMENT_OPEN_FAILED: "Ouverture du règlement en échec",
  SUBSCRIPTION_PAYMENT_SETTLED: "Règlement d'abonnement encaissé",
  SUBSCRIPTION_PAYMENT_FAILED: "Règlement d'abonnement refusé",
  FUND_RESERVATION_CREATED: 'Part formateur réservée',
  FUND_RESERVATION_DEBITED: 'Part formateur débitée',
  FUND_RESERVATION_RELEASED: 'Part formateur libérée',

  // --- Litiges, remboursements, signalements ---
  DISPUTE_OPENED: 'Contestation ouverte',
  DISPUTE_ASK_LEARNER: 'Précision demandée à l’apprenant',
  DISPUTE_MESSAGE_POSTED: 'Message ajouté au dossier',
  DISPUTE_CONTESTED: 'Contestation contestée',
  DISPUTE_CONTESTED_BY_TRAINER: 'Contestation contestée par le formateur',
  DISPUTE_RESOLVED_REFUNDED: 'Contestation tranchée — remboursée',
  DISPUTE_RESOLVED_REJECTED: 'Contestation tranchée — rejetée',
  DISPUTE_RESOLVED_AUTO: 'Contestation tranchée automatiquement',
  DISPUTE_REFUND_REQUESTED: 'Remboursement demandé',
  DISPUTE_REFUND_COMPLETED: 'Remboursement exécuté',
  DISPUTE_AUTO_CLOSE_SKIPPED: 'Clôture automatique écartée',
  DOUBLE_DEBIT_PREVENTED: 'Double débit empêché',
  MANUAL_REFUND_TASK_CREATED: 'Remboursement manuel à exécuter',
  MANUAL_REFUND_TASK_COMPLETED: 'Remboursement manuel exécuté',
  MANUAL_REFUND_TASK_CANCELLED: 'Remboursement manuel annulé',
  REPORT_CREATED: 'Signalement déposé',
  REPORT_UPHELD: 'Signalement retenu',
  REPORT_DISMISSED: 'Signalement écarté',
  CHARGEBACK_MERGED_INTO_DISPUTE: 'Impayé bancaire rattaché à un litige',
  CHARGEBACK_CLOSED_IGNORED: 'Impayé bancaire clos sans suite',
  CHARGEBACK_CLOSE_DISPUTE_NOT_FOUND: 'Impayé bancaire clos — litige introuvable',
  CHARGEBACK_CONTEST_FAILED: "Contestation d'impayé en échec",
  CHARGEBACK_PURCHASE_NOT_FOUND: 'Impayé bancaire — achat introuvable',
  CHARGEBACK_WITHOUT_PAYMENT_INTENT: 'Impayé bancaire sans paiement rattaché',

  // --- Retraits & moyens de paiement ---
  PAYOUT_REQUESTED: 'Retrait demandé',
  PAYOUT_APPROVED: 'Retrait approuvé',
  PAYOUT_REJECTED: 'Retrait refusé',
  PAYOUT_REOPENED: 'Retrait rouvert',
  PAYOUT_PAID: 'Retrait versé',
  PAYOUT_FAILED: 'Retrait en échec',
  PAYOUT_DISPATCHED: 'Virement envoyé',
  PAYOUT_DISPATCH_FAILED: 'Envoi du virement en échec',
  PAYOUT_DISPATCH_MANUAL: 'Virement à exécuter à la main',
  PAYOUT_METHOD_CREATED: 'Moyen de paiement enregistré',
  PAYOUT_METHOD_VERIFIED: 'Moyen de paiement vérifié',
  PAYOUT_METHOD_REJECTED: 'Moyen de paiement refusé',
  PAYOUT_METHOD_BLOCKED: 'Moyen de paiement escaladé',
  PAYOUT_METHOD_ESCALATION_RESOLVED: 'Escalade tranchée',
  PAYOUT_METHOD_CARENCE_EXPIRED: 'Délai de sécurité écoulé',
  PAYOUT_METHOD_MICRO_DEPOSIT_ISSUED: 'Micro-virement envoyé',
  PAYOUT_METHOD_MICRO_DEPOSIT_CONFIRMED: 'Micro-virement confirmé',
  PAYOUT_METHOD_DOCUMENT_VIEW: 'Justificatif consulté',
  PAYOUT_METHOD_SLA_BREACH: 'Délai de revue dépassé',

  // --- Abonnements & tarification ---
  SUBSCRIPTION_PERIOD_INITIALIZED: "Période d'abonnement ouverte",
  SUBSCRIPTION_PERIOD_DUE: 'Échéance ouverte',
  SUBSCRIPTION_PERIOD_WAIVED: 'Échéance annulée',
  SUBSCRIPTION_CHARGE_SETTLED: 'Échéance réglée',
  SUBSCRIPTION_SUSPENDED: 'Abonnement suspendu',
  SUBSCRIPTION_SUSPENSION_UPCOMING: 'Suspension annoncée',
  MEMBERSHIP_STARTED: 'Adhésion ouverte',
  MEMBERSHIP_RENEWED: 'Adhésion renouvelée',
  MEMBERSHIP_CANCELED: 'Adhésion résiliée',
  MEMBERSHIP_RESUMED: 'Adhésion reprise',
  MEMBERSHIP_ENDED: 'Adhésion terminée',
  MEMBERSHIP_PERIOD_DUE: "Échéance d'adhésion ouverte",
  MEMBERSHIP_PAYMENT_INITIATED: "Paiement d'adhésion engagé",
  PLATFORM_TARIFF_SET: 'Tarif de la plateforme posé',
  PLATFORM_DISCOUNT_CREATED: 'Réduction créée',
  PLATFORM_DISCOUNT_ENDED: 'Réduction close',

  // --- Communautés, messages, lives ---
  COMMUNITY_CREATED: 'Communauté créée',
  COMMUNITY_UPDATED: 'Communauté modifiée',
  COMMUNITY_AVATAR_UPLOADED: 'Photo du groupe déposée',
  COMMUNITY_AVATAR_REMOVED: 'Photo du groupe retirée',
  COMMUNITY_VISIBILITY_CHANGED: 'Visibilité de la communauté modifiée',
  COMMUNITY_CLOSED: 'Communauté fermée',
  COMMUNITY_REOPENED: 'Communauté rouverte',
  COMMUNITY_COURSE_LINKED: 'Ressource rattachée à la communauté',
  COMMUNITY_COURSE_UNLINKED: 'Ressource détachée de la communauté',
  COMMUNITY_MEMBER_BANNED: 'Membre banni',
  COMMUNITY_MEMBER_UNBANNED: 'Bannissement levé',
  COMMUNITY_POST_CREATED: 'Publication écrite',
  COMMUNITY_POST_DELETED: 'Publication supprimée',
  COMMUNITY_REPLY_CREATED: 'Réponse écrite',
  COMMUNITY_REPLY_DELETED: 'Réponse supprimée',
  INVITATION_ISSUED: 'Invitation émise',
  INVITATION_ACCEPTED: 'Invitation acceptée',
  INVITATION_REVOKED: 'Invitation révoquée',
  INVITATION_REVOKED_BY_VISIBILITY: 'Invitations révoquées — communauté passée publique',
  INVITATION_OVERRUN: 'Quota d’invitations dépassé',
  INVITATION_ANONYMIZED: 'Invitation anonymisée',
  INVITATION_PURGE_COMPLETED: 'Purge des invitations terminée',
  MESSAGE_SENT: 'Message envoyé',
  LIVE_SESSION_SCHEDULED: 'Live programmé',
  LIVE_SESSION_STARTED: 'Live démarré',
  LIVE_SESSION_ENDED: 'Live terminé',
  LIVE_SESSION_CANCELED: 'Live annulé',
  LIVE_MUTE_ALL: 'Tous les participants réduits au silence',
  LIVE_PARTICIPANT_MUTED: 'Participant réduit au silence',
  LIVE_PARTICIPANT_UNMUTED: 'Participant réautorisé à parler',
  LIVE_SCREEN_GRANTED: 'Partage d’écran autorisé',
  LIVE_SCREEN_REVOKED: 'Partage d’écran retiré',

  // --- Tâches planifiées & intégrations ---
  SCHEDULED_JOB_COMPLETED: 'Tâche planifiée terminée',
  SCHEDULED_JOB_FAILED: 'Tâche planifiée en échec',
  SETTING_UPDATED: 'Réglage modifié',
  CONTACT_MESSAGE_SENT: 'Message au support envoyé',
  NOTIFICATION_DELIVERY_FAILED: "Envoi d'une notification en échec",
  STRIPE_WEBHOOK_EVENT_IGNORED: 'Événement Stripe ignoré',
  MUX_WEBHOOK_IGNORED: 'Événement Mux ignoré',
  MUX_WEBHOOK_EVENT_IGNORED: 'Événement Mux ignoré',
  MUX_WEBHOOK_REJECTED: 'Événement Mux refusé',
  MUX_WEBHOOK_UNKNOWN_STREAM: 'Événement Mux sur un flux inconnu',
  PAWAPAY_CALLBACK_IGNORED: 'Retour PawaPay ignoré',
  PAWAPAY_CALLBACK_REJECTED: 'Retour PawaPay refusé',
  PAWAPAY_CALLBACK_UNAPPLIED: 'Retour PawaPay non appliqué',
  PROVIDER_RECONCILE_ERROR: 'Rapprochement avec le fournisseur en échec',
  LIVE_SESSION_NEVER_STARTED: 'Séances jamais lancées, closes',
  WEBHOOK_DUPLICATE_IGNORED: 'Webhook déjà traité, ignoré',
}

// ==========================================================================
// Types d'objet
// ==========================================================================

export const AUDIT_TARGET_LABELS: Record<string, string> = {
  User: 'Compte',
  TrainerProfile: 'Formateur',
  TrainerApplication: 'Candidature',
  TrainerDocument: 'Pièce justificative',
  Course: 'Ressource',
  Replay: 'Rediffusion',
  Purchase: 'Achat',
  Invoice: 'Facture',
  Dispute: 'Litige',
  Report: 'Signalement',
  Payout: 'Retrait',
  PayoutMethod: 'Moyen de paiement',
  Wallet: 'Portefeuille',
  FundReservation: 'Réservation de fonds',
  Community: 'Communauté',
  CommunityPost: 'Publication',
  CommunitySubscription: 'Adhésion',
  CommunityInvitation: 'Invitation',
  Conversation: 'Conversation',
  LiveSession: 'Live',
  SubscriptionCharge: "Échéance d'abonnement",
  PlatformTariff: 'Tarif',
  PlatformDiscount: 'Réduction',
  Setting: 'Réglage',
  ScheduledJob: 'Tâche planifiée',
}

// ==========================================================================
// Rendu
// ==========================================================================

/**
 * Repli pour un code sans libellé : `FUND_RESERVATION_DEBITED` devient
 * « Fund reservation debited ». Ce n'est pas du français, et c'est voulu — une
 * traduction approximative se ferait passer pour une vraie. La forme reste
 * lisible et le code exact s'affiche à côté.
 */
function humanize(action: string): string {
  const words = action.toLowerCase().replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? humanize(action)
}

export function auditTargetLabel(targetType: string | null): string | null {
  if (!targetType) return null
  return AUDIT_TARGET_LABELS[targetType] ?? targetType
}

/**
 * Un identifiant opaque — cuid, uuid — se réduit à ses huit premiers
 * caractères : au-delà, il encombre sans rien apprendre.
 *
 * Tout le reste s'affiche **entier**. L'écran coupait tout à huit caractères,
 * ce qui changeait `support.response_time_hours` en « support. » et
 * `REPLAY_RECONCILE` en « REPLAY_R » : les identifiants qui portent du sens
 * sont précisément ceux qu'il ne faut pas amputer.
 */
export function shortenTargetId(targetId: string): string {
  const opaque = /^c[a-z0-9]{20,}$/i.test(targetId) || /^[0-9a-f-]{32,36}$/i.test(targetId)
  return opaque ? targetId.slice(0, 8) : targetId
}
