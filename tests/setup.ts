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
  // CINETPAY_SECRET_KEY : renseignée, le webhook exige un HMAC X-TOKEN valide
  // et rejette en 400 les notifications forgées par les tests.
  'CINETPAY_API_KEY', 'CINETPAY_SITE_ID', 'CINETPAY_SECRET_KEY',
  'RESEND_API_KEY',
  'R2_ENDPOINT', 'R2_ACCESS_KEY', 'R2_SECRET_KEY',
  // LIVEKIT_* : renseignées dans le .env de dev. Sans neutralisation,
  // `startLiveSession` appelle réellement `createRoom` et `startEgress` sur le
  // serveur temps réel — la suite ouvrirait des salles et lancerait des
  // enregistrements facturés à chaque exécution.
  'LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET',
]) {
  process.env[key] = ''
}

const prisma = new PrismaClient()

// Helper : nettoyer toutes les tables entre les tests via TRUNCATE CASCADE.
export async function cleanDatabase() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "audit_logs", "notifications", "settings", "email_otps", "pending_attachments",
      "favorites",
      "trainer_application_review_events", "trainer_documents", "trainer_applications",
      "payout_method_review_events", "payout_review_events", "payouts",
      "wallet_reconciliations", "payout_methods", "wallets", "trainer_profiles",
      "replays", "live_messages", "live_participants", "live_sessions",
      "messages", "conversations",
      "community_post_replies", "community_posts",
      "community_courses", "community_subscriptions", "communities", "purchases", "courses",
      "course_views", "consumption_snapshots",
      "dispute_messages", "dispute_review_events", "fund_reservations",
      "disputes", "support_tickets", "manual_refund_tasks",
      "reports", "platform_tariffs", "platform_discounts", "subscription_charges",
      "users"
    CASCADE
  `)
}

export { prisma }
