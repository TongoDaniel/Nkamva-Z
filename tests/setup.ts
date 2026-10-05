// ==========================================================================
// Lot 0 — Configuration des tests
// ==========================================================================

import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'

// Charger .env AVANT de neutraliser : sinon db.ts le chargerait plus tard et
// réintroduirait les clés de service qu'on vient d'effacer (dotenv n'écrase
// pas une variable déjà définie, y compris quand elle vaut '').
config()

// Override DATABASE_URL pour pointer sur la base de test.
// Le défaut suit .env.example : rôle `nkamva`, port 5433, auth trust — le
// serveur de dev documenté depuis la suppression du docker-compose.
// TEST_DATABASE_URL reste prioritaire pour pointer ailleurs.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://nkamva@localhost:5433/nkamva_test?schema=public'

// Les tests doivent rester hermétiques : le .env de dev porte des secrets
// RÉELS (Resend actif, R2 production, Stripe test). Sans cette neutralisation,
// la suite enverrait de vrais emails à trainer@test.com, écrirait dans le
// bucket de production et appellerait l'API Stripe sur des PaymentIntent
// inexistants — ce qui ferait en plus échouer le chemin de repli dev du Lot 2.
//
// On assigne '' plutôt que `delete` : plusieurs tests sauvegardent puis
// restaurent ces variables, et restaurer `undefined` écrirait la chaîne
// "undefined" (truthy) dans process.env.
for (const key of [
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PUBLISHABLE_KEY',
  // PAWAPAY_API_TOKEN : sans elle, aucun appel ne part chez le fournisseur — et
  // les callbacks refusent tout, faute de pouvoir récupérer les clés publiques
  // qui vérifient leur signature. C'est exactement ce qu'on veut en test.
  'PAWAPAY_API_TOKEN', 'PAWAPAY_BASE_URL', 'PAWAPAY_ENVIRONMENT',
  'PAWAPAY_CALLBACK_AUTHORITY',
  'RESEND_API_KEY',
  // Le stockage objet porte les noms standard du SDK AWS. Cette liste a
  // longtemps neutralisé `R2_*`, qui n'existaient nulle part : elle ne
  // protégeait rien, et la suite aurait écrit dans le vrai seau si le code
  // avait lu les bons noms — ce qu'il ne faisait pas non plus.
  'AWS_ENDPOINT_URL', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY',
  'AWS_REGION', 'AWS_BUCKET_NAME', 'AWS_PUBLIC_URL',
  // MUX_* : aucun code ne les lit aujourd'hui, mais les neutraliser coûte une
  // ligne et évite qu'un futur appel parte en test.
  'MUX_TOKEN_ID', 'MUX_TOKEN_SECRET', 'MUX_WEBHOOK_SECRET',
  // LIVEKIT_* : renseignées dans le .env de dev. Sans neutralisation,
  // `startLiveSession` appelle réellement `createRoom` et `startEgress` sur le
  // serveur temps réel — la suite ouvrirait des salles et lancerait des
  // enregistrements facturés à chaque exécution.
  'LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET',
]) {
  process.env[key] = ''
}

// Le contrôle des mots de passe fuités appelle l'API Have I Been Pwned : coupé
// ici, la suite ne dépend pas du réseau. `tests/mot-de-passe-fuite.test.ts` le
// rallume avec un `fetch` simulé.
process.env.PASSWORD_BREACH_CHECK = 'off'

// `NEXTAUTH_SECRET` n'est pas une clé de service externe : elle signe les
// jetons de session et dérive la clé qui chiffre les secrets TOTP. La
// neutraliser casserait tout ce qui en dépend. On la **remplace** par une
// valeur de test déterministe : le secret de dev ne sert jamais ici, et les
// chiffrements restent reproductibles d'une exécution à l'autre.
process.env.NEXTAUTH_SECRET = 'nkamva-test-secret-deterministe-0123456789'

// Les tests du parcours d'achat exercent les règles métier (crédit du
// portefeuille, accès, litiges), pas le fournisseur de paiement. Sans ce
// drapeau, `openProviderPayment` refuserait — c'est précisément le
// comportement voulu en production, et c'est pourquoi il faut l'autoriser
// explicitement ici plutôt que de le déduire d'une clé absente.
process.env.ALLOW_PAYMENT_SIMULATION = '1'

const prisma = new PrismaClient()

// Helper : nettoyer toutes les tables entre les tests via TRUNCATE CASCADE.
export async function cleanDatabase() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "audit_logs", "notifications", "settings", "fx_rates", "email_otps", "pending_attachments",
      "favorites",
      "trainer_application_review_events", "trainer_documents",
      "trainer_activation_payments", "trainer_applications",
      "payout_method_review_events", "payout_review_events", "payouts",
      "wallet_reconciliations", "wallet_debits", "payout_methods", "wallets", "trainer_profiles",
      "recovery_codes",
      "invoices", "invoice_counters",
      "replays", "live_messages", "live_participants", "live_sessions",
      "messages", "conversations",
      "community_post_replies", "community_posts",
      "community_courses", "community_subscriptions", "communities", "purchases", "courses",
      "course_views", "consumption_snapshots",
      "dispute_messages", "dispute_review_events", "fund_reservations",
      "disputes", "support_tickets", "manual_refund_tasks",
      "reports", "platform_tariffs", "platform_discounts",
      "subscription_payments", "subscription_charges",
      "users"
    CASCADE
  `)
}

export { prisma }
