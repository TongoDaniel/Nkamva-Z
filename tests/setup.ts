// ==========================================================================
// Lot 0 — Configuration des tests
// ==========================================================================

import { PrismaClient } from '@prisma/client'

// Override DATABASE_URL pour pointer sur la base de test
process.env.DATABASE_URL = 'postgresql://nkamva@localhost:5433/nkamva_test?schema=public'

const prisma = new PrismaClient()

// Helper : nettoyer toutes les tables entre les tests via TRUNCATE CASCADE.
export async function cleanDatabase() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "audit_logs", "notifications", "settings", "email_otps", "pending_attachments",
      "trainer_application_review_events", "trainer_documents", "trainer_applications",
      "payout_method_review_events", "payout_review_events", "payouts",
      "wallet_reconciliations", "payout_methods", "wallets", "trainer_profiles",
      "community_subscriptions", "communities", "purchases", "courses",
      "course_views", "consumption_snapshots",
      "dispute_messages", "dispute_review_events", "fund_reservations",
      "disputes", "support_tickets", "manual_refund_tasks",
      "users"
    CASCADE
  `)
}

export { prisma }
