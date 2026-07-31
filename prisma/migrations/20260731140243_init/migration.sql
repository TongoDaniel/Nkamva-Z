-- CreateEnum
CREATE TYPE "Role" AS ENUM ('LEARNER', 'PENDING_TRAINER', 'TRAINER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'FINANCES', 'MODERATION');

-- CreateEnum
CREATE TYPE "TrainerPlan" AS ENUM ('STARTER', 'PRO', 'EXPERT');

-- CreateEnum
CREATE TYPE "TrainerSubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'CINETPAY');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'DISPUTED', 'CANCELED');

-- CreateEnum
CREATE TYPE "CommunitySubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'BANNED', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PayoutMethodType" AS ENUM ('BANK_IBAN', 'MOBILE_MONEY');

-- CreateEnum
CREATE TYPE "AccountNature" AS ENUM ('INDIVIDUAL', 'BUSINESS');

-- CreateEnum
CREATE TYPE "MobileMoneyOperator" AS ENUM ('WAVE', 'ORANGE_MONEY', 'MTN_MOMO', 'AIRTEL_MONEY', 'M_PESA');

-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('NAME_LOOKUP', 'MANUAL_FINANCE', 'MICRO_DEPOSIT', 'ESCALATION');

-- CreateEnum
CREATE TYPE "PayoutMethodVerificationStatus" AS ENUM ('PENDING_REVIEW', 'AUTO_VERIFIED', 'MANUAL_VERIFIED', 'VERIFIED', 'REJECTED', 'BLOCKED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'AUTO_APPROVED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "TrainerDocumentType" AS ENUM ('ID_CARD', 'DIPLOMA', 'VIDEO');

-- CreateEnum
CREATE TYPE "TrainerDocumentStatus" AS ENUM ('AWAITING_UPLOAD', 'PENDING', 'APPROVED', 'REJECTED', 'RESUBMITTED');

-- CreateEnum
CREATE TYPE "TrainerApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'RESUBMISSION_PENDING');

-- CreateEnum
CREATE TYPE "DisputeSource" AS ENUM ('LEARNER_REQUEST', 'STRIPE_CHARGEBACK', 'CINETPAY_DISPUTE', 'ADMIN_INITIATED');

-- CreateEnum
CREATE TYPE "DisputeReason" AS ENUM ('CONTENT_MISMATCH', 'DOUBLE_CHARGE', 'ACCESS_ISSUE', 'UNAUTHORIZED_CHARGE', 'OTHER');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'WAITING_LEARNER', 'RESOLVED_REFUNDED', 'RESOLVED_REJECTED', 'RESOLVED_AUTO');

-- CreateEnum
CREATE TYPE "DisputeResolution" AS ENUM ('FULL_REFUND', 'PARTIAL_REFUND', 'REJECT', 'AUTO_TIMEOUT');

-- CreateEnum
CREATE TYPE "DisputeMessageAuthorRole" AS ENUM ('LEARNER', 'SUPPORT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "FundReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'DEBITED', 'PARTIALLY_DEBITED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "passwordHash" TEXT,
    "googleSub" TEXT,
    "fullName" TEXT,
    "preferredName" TEXT,
    "phone" TEXT,
    "countryCode" TEXT,
    "avatarUrl" TEXT,
    "bio" TEXT,
    "role" "Role" NOT NULL DEFAULT 'LEARNER',
    "adminRole" "AdminRole",
    "payoutMethodRejectionCount" INTEGER NOT NULL DEFAULT 0,
    "suspendedAt" TIMESTAMP(3),
    "suspendedReason" TEXT,
    "suspendedById" TEXT,
    "sessionsValidAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gdprExportRequestedAt" TIMESTAMP(3),
    "gdprExportS3Key" TEXT,
    "deletionRequestedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainer_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slogan" TEXT,
    "description" TEXT,
    "websiteUrl" TEXT,
    "domains" TEXT[],
    "experienceYears" INTEGER,
    "verifiedLegalName" TEXT,
    "commissionRate" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "plan" "TrainerPlan" NOT NULL DEFAULT 'STARTER',
    "subscriptionStatus" "TrainerSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "subscriptionProvider" "PaymentProvider",
    "subscriptionProviderId" TEXT,
    "subscriptionCurrentPeriodEnd" TIMESTAMP(3),
    "subscriptionCanceledAt" TIMESTAMP(3),
    "ratingAverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "studentsCount" INTEGER NOT NULL DEFAULT 0,
    "approvedAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "suspendedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trainer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "blurb" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "learnPoints" TEXT[],
    "includes" TEXT[],
    "category" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "coverS3Key" TEXT,
    "priceFcfa" INTEGER NOT NULL,
    "level" TEXT,
    "language" TEXT NOT NULL DEFAULT 'fr',
    "durationSeconds" INTEGER,
    "lessonsCount" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "livekitRoomName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "courseId" TEXT,
    "communityId" TEXT,
    "trainerId" TEXT NOT NULL,
    "amountFcfa" INTEGER NOT NULL,
    "commissionRate" DOUBLE PRECISION NOT NULL,
    "trainerShareFcfa" INTEGER NOT NULL,
    "platformShareFcfa" INTEGER NOT NULL,
    "amountEur" DECIMAL(10,2),
    "eurRate" DECIMAL(10,4),
    "provider" "PaymentProvider" NOT NULL,
    "providerTransactionId" TEXT,
    "providerStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "acquisitionSource" TEXT,
    "refundedAt" TIMESTAMP(3),
    "refundAmountFcfa" INTEGER,
    "providerRefundId" TEXT,
    "providerDisputeActive" BOOLEAN NOT NULL DEFAULT false,
    "accessSuspended" BOOLEAN NOT NULL DEFAULT false,
    "accessSuspendedAt" TIMESTAMP(3),
    "accessRestoredAt" TIMESTAMP(3),
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communities" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "rules" TEXT,
    "coverS3Key" TEXT,
    "priceFcfa" INTEGER NOT NULL,
    "commissionRate" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "forumEnabled" BOOLEAN NOT NULL DEFAULT true,
    "broadcastEnabled" BOOLEAN NOT NULL DEFAULT true,
    "messagingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "resourcesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "eventsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "membersCount" INTEGER NOT NULL DEFAULT 0,
    "messagesPerDay" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_subscriptions" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "status" "CommunitySubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "providerSubscriptionId" TEXT,
    "purchaseId" TEXT,
    "bannedAt" TIMESTAMP(3),
    "bannedReason" TEXT,
    "bannedById" TEXT,
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "reservedBalance" INTEGER NOT NULL DEFAULT 0,
    "pendingPayoutBalance" INTEGER NOT NULL DEFAULT 0,
    "negativeSince" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_reconciliations" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "previousValue" INTEGER NOT NULL,
    "newValue" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "reconciledById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_methods" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "type" "PayoutMethodType" NOT NULL,
    "accountNature" "AccountNature" NOT NULL,
    "verifiedLegalNameAtCreation" TEXT NOT NULL,
    "trainerEmailSnapshot" TEXT NOT NULL,
    "trainerPhoneSnapshot" TEXT,
    "holderName" TEXT,
    "businessName" TEXT,
    "businessDocS3Key" TEXT,
    "legalRepProofS3Key" TEXT,
    "iban" TEXT,
    "bic" TEXT,
    "mobileOperator" "MobileMoneyOperator",
    "mobilePhone" TEXT,
    "verificationStatus" "PayoutMethodVerificationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "verificationMethod" "VerificationMethod",
    "nameLookupResult" TEXT,
    "nameLookupRawName" TEXT,
    "microDepositAmount1" INTEGER,
    "microDepositAmount2" INTEGER,
    "microDepositReference" TEXT,
    "microDepositVerifiedAt" TIMESTAMP(3),
    "carenceUntil" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "payoutMethodId" TEXT NOT NULL,
    "amountFcfa" INTEGER NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "kycScoreSnapshot" INTEGER,
    "kycBadgeSnapshot" TEXT,
    "kycCriteriaSnapshot" JSONB,
    "isFirstPayout" BOOLEAN NOT NULL DEFAULT false,
    "carenceHolds" BOOLEAN NOT NULL DEFAULT false,
    "wireInitiatedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "paidAt" TIMESTAMP(3),
    "providerReference" TEXT,
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "receiptS3Key" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_method_review_events" (
    "id" TEXT NOT NULL,
    "payoutMethodId" TEXT NOT NULL,
    "fromStatus" "PayoutMethodVerificationStatus" NOT NULL,
    "toStatus" "PayoutMethodVerificationStatus" NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_method_review_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_review_events" (
    "id" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "fromStatus" "PayoutStatus" NOT NULL,
    "toStatus" "PayoutStatus" NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_review_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_otps" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "email_otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_attachments" (
    "id" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "issuerId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "disputeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "consumedIn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainer_applications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "TrainerApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "slogan" TEXT,
    "description" TEXT,
    "websiteUrl" TEXT,
    "domains" TEXT[],
    "experienceYears" INTEGER,
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "finalRejectionReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "reopenedById" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trainer_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainer_documents" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "type" "TrainerDocumentType" NOT NULL,
    "status" "TrainerDocumentStatus" NOT NULL DEFAULT 'AWAITING_UPLOAD',
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "s3Key" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "mimeType" TEXT,
    "originalFileName" TEXT,
    "rejectionReason" TEXT,
    "resubmissionCount" INTEGER NOT NULL DEFAULT 0,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "purgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trainer_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainer_application_review_events" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "fromStatus" "TrainerApplicationStatus" NOT NULL,
    "toStatus" "TrainerApplicationStatus" NOT NULL,
    "actorId" TEXT,
    "reason" TEXT,
    "rejectedDocIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trainer_application_review_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainer_document_review_events" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "fromStatus" "TrainerDocumentStatus" NOT NULL,
    "toStatus" "TrainerDocumentStatus" NOT NULL,
    "actorId" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trainer_document_review_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "source" "DisputeSource" NOT NULL,
    "reason" "DisputeReason" NOT NULL,
    "reasonDetail" TEXT,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "disputedAmountFcfa" INTEGER NOT NULL,
    "amountEur" DECIMAL(10,2),
    "resolution" "DisputeResolution",
    "resolutionNote" TEXT,
    "overrideJustification" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "learnerDeadlineAt" TIMESTAMP(3),
    "providerDisputeId" TEXT,
    "consumptionSnapshotId" TEXT,
    "refundStatus" TEXT,
    "refundProcessedAt" TIMESTAMP(3),
    "providerRefundId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute_messages" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorRole" "DisputeMessageAuthorRole" NOT NULL,
    "body" TEXT NOT NULL,
    "attachments" TEXT[],
    "readBySupport" BOOLEAN NOT NULL DEFAULT false,
    "readByLearner" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispute_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fund_reservations" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "reservedAmountFcfa" INTEGER NOT NULL,
    "status" "FundReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "debitedAmount" INTEGER NOT NULL DEFAULT 0,
    "releasedAmount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "releasedById" TEXT,
    "releaseReason" TEXT,

    CONSTRAINT "fund_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute_review_events" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "fromStatus" "DisputeStatus" NOT NULL,
    "toStatus" "DisputeStatus" NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispute_review_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumption_snapshots" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "courseFormat" TEXT NOT NULL,
    "watchedSeconds" INTEGER,
    "courseDurationSeconds" INTEGER,
    "downloaded" BOOLEAN,
    "consumptionPercent" INTEGER NOT NULL,
    "ruleApplies" BOOLEAN NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumption_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_views" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "watchedSeconds" INTEGER NOT NULL DEFAULT 0,
    "downloaded" BOOLEAN NOT NULL DEFAULT false,
    "downloadedAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_refund_tasks" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'CINETPAY',
    "refundAmountFcfa" INTEGER NOT NULL,
    "trainerDebitFcfa" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "assignedToId" TEXT,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manual_refund_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "attachments" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolutionNote" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_googleSub_key" ON "users"("googleSub");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_adminRole_idx" ON "users"("adminRole");

-- CreateIndex
CREATE INDEX "users_suspendedAt_idx" ON "users"("suspendedAt");

-- CreateIndex
CREATE UNIQUE INDEX "trainer_profiles_userId_key" ON "trainer_profiles"("userId");

-- CreateIndex
CREATE INDEX "trainer_profiles_plan_idx" ON "trainer_profiles"("plan");

-- CreateIndex
CREATE INDEX "trainer_profiles_subscriptionStatus_idx" ON "trainer_profiles"("subscriptionStatus");

-- CreateIndex
CREATE UNIQUE INDEX "courses_slug_key" ON "courses"("slug");

-- CreateIndex
CREATE INDEX "courses_status_category_idx" ON "courses"("status", "category");

-- CreateIndex
CREATE INDEX "courses_trainerId_status_idx" ON "courses"("trainerId", "status");

-- CreateIndex
CREATE INDEX "courses_publishedAt_idx" ON "courses"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_providerTransactionId_key" ON "purchases"("providerTransactionId");

-- CreateIndex
CREATE INDEX "purchases_learnerId_createdAt_idx" ON "purchases"("learnerId", "createdAt");

-- CreateIndex
CREATE INDEX "purchases_trainerId_createdAt_idx" ON "purchases"("trainerId", "createdAt");

-- CreateIndex
CREATE INDEX "purchases_courseId_idx" ON "purchases"("courseId");

-- CreateIndex
CREATE INDEX "purchases_communityId_idx" ON "purchases"("communityId");

-- CreateIndex
CREATE INDEX "purchases_provider_providerStatus_idx" ON "purchases"("provider", "providerStatus");

-- CreateIndex
CREATE INDEX "purchases_providerDisputeActive_idx" ON "purchases"("providerDisputeActive");

-- CreateIndex
CREATE UNIQUE INDEX "communities_slug_key" ON "communities"("slug");

-- CreateIndex
CREATE INDEX "communities_trainerId_status_idx" ON "communities"("trainerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "community_subscriptions_purchaseId_key" ON "community_subscriptions"("purchaseId");

-- CreateIndex
CREATE INDEX "community_subscriptions_status_idx" ON "community_subscriptions"("status");

-- CreateIndex
CREATE INDEX "community_subscriptions_learnerId_status_idx" ON "community_subscriptions"("learnerId", "status");

-- CreateIndex
CREATE INDEX "community_subscriptions_communityId_status_idx" ON "community_subscriptions"("communityId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_trainerId_key" ON "wallets"("trainerId");

-- CreateIndex
CREATE INDEX "wallet_reconciliations_walletId_createdAt_idx" ON "wallet_reconciliations"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "payout_methods_trainerId_isActive_idx" ON "payout_methods"("trainerId", "isActive");

-- CreateIndex
CREATE INDEX "payout_methods_verificationStatus_idx" ON "payout_methods"("verificationStatus");

-- CreateIndex
CREATE INDEX "payout_methods_carenceUntil_idx" ON "payout_methods"("carenceUntil");

-- CreateIndex
CREATE INDEX "payouts_trainerId_status_idx" ON "payouts"("trainerId", "status");

-- CreateIndex
CREATE INDEX "payouts_status_submittedAt_idx" ON "payouts"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "payout_method_review_events_payoutMethodId_createdAt_idx" ON "payout_method_review_events"("payoutMethodId", "createdAt");

-- CreateIndex
CREATE INDEX "payout_review_events_payoutId_createdAt_idx" ON "payout_review_events"("payoutId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_targetType_targetId_idx" ON "audit_logs"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_createdAt_idx" ON "notifications"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

-- CreateIndex
CREATE INDEX "email_otps_email_expiresAt_idx" ON "email_otps"("email", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "pending_attachments_s3Key_key" ON "pending_attachments"("s3Key");

-- CreateIndex
CREATE INDEX "pending_attachments_issuerId_status_idx" ON "pending_attachments"("issuerId", "status");

-- CreateIndex
CREATE INDEX "pending_attachments_expiresAt_idx" ON "pending_attachments"("expiresAt");

-- CreateIndex
CREATE INDEX "pending_attachments_scope_status_idx" ON "pending_attachments"("scope", "status");

-- CreateIndex
CREATE INDEX "trainer_applications_status_idx" ON "trainer_applications"("status");

-- CreateIndex
CREATE INDEX "trainer_applications_submittedAt_idx" ON "trainer_applications"("submittedAt");

-- CreateIndex
CREATE INDEX "trainer_documents_applicationId_type_isCurrent_idx" ON "trainer_documents"("applicationId", "type", "isCurrent");

-- CreateIndex
CREATE INDEX "trainer_documents_status_idx" ON "trainer_documents"("status");

-- CreateIndex
CREATE INDEX "trainer_documents_applicationId_status_idx" ON "trainer_documents"("applicationId", "status");

-- CreateIndex
CREATE INDEX "trainer_application_review_events_applicationId_createdAt_idx" ON "trainer_application_review_events"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "trainer_document_review_events_documentId_createdAt_idx" ON "trainer_document_review_events"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "disputes_status_idx" ON "disputes"("status");

-- CreateIndex
CREATE INDEX "disputes_purchaseId_idx" ON "disputes"("purchaseId");

-- CreateIndex
CREATE INDEX "disputes_trainerId_status_idx" ON "disputes"("trainerId", "status");

-- CreateIndex
CREATE INDEX "disputes_learnerId_status_idx" ON "disputes"("learnerId", "status");

-- CreateIndex
CREATE INDEX "disputes_lastActivityAt_idx" ON "disputes"("lastActivityAt");

-- CreateIndex
CREATE INDEX "dispute_messages_disputeId_createdAt_idx" ON "dispute_messages"("disputeId", "createdAt");

-- CreateIndex
CREATE INDEX "fund_reservations_disputeId_idx" ON "fund_reservations"("disputeId");

-- CreateIndex
CREATE INDEX "fund_reservations_walletId_status_idx" ON "fund_reservations"("walletId", "status");

-- CreateIndex
CREATE INDEX "dispute_review_events_disputeId_createdAt_idx" ON "dispute_review_events"("disputeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "consumption_snapshots_disputeId_key" ON "consumption_snapshots"("disputeId");

-- CreateIndex
CREATE INDEX "course_views_learnerId_courseId_idx" ON "course_views"("learnerId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "course_views_courseId_learnerId_key" ON "course_views"("courseId", "learnerId");

-- CreateIndex
CREATE UNIQUE INDEX "manual_refund_tasks_disputeId_key" ON "manual_refund_tasks"("disputeId");

-- CreateIndex
CREATE INDEX "manual_refund_tasks_status_createdAt_idx" ON "manual_refund_tasks"("status", "createdAt");

-- CreateIndex
CREATE INDEX "support_tickets_disputeId_idx" ON "support_tickets"("disputeId");

-- CreateIndex
CREATE INDEX "support_tickets_trainerId_status_idx" ON "support_tickets"("trainerId", "status");

-- AddForeignKey
ALTER TABLE "trainer_profiles" ADD CONSTRAINT "trainer_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "trainer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "trainer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communities" ADD CONSTRAINT "communities_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "trainer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_subscriptions" ADD CONSTRAINT "community_subscriptions_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_subscriptions" ADD CONSTRAINT "community_subscriptions_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_subscriptions" ADD CONSTRAINT "community_subscriptions_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "trainer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_reconciliations" ADD CONSTRAINT "wallet_reconciliations_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_methods" ADD CONSTRAINT "payout_methods_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "trainer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "trainer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_payoutMethodId_fkey" FOREIGN KEY ("payoutMethodId") REFERENCES "payout_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_method_review_events" ADD CONSTRAINT "payout_method_review_events_payoutMethodId_fkey" FOREIGN KEY ("payoutMethodId") REFERENCES "payout_methods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_review_events" ADD CONSTRAINT "payout_review_events_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "payouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_otps" ADD CONSTRAINT "email_otps_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_applications" ADD CONSTRAINT "trainer_applications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_documents" ADD CONSTRAINT "trainer_documents_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "trainer_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_application_review_events" ADD CONSTRAINT "trainer_application_review_events_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "trainer_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_document_review_events" ADD CONSTRAINT "trainer_document_review_events_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "trainer_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "trainer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_messages" ADD CONSTRAINT "dispute_messages_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fund_reservations" ADD CONSTRAINT "fund_reservations_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fund_reservations" ADD CONSTRAINT "fund_reservations_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_review_events" ADD CONSTRAINT "dispute_review_events_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumption_snapshots" ADD CONSTRAINT "consumption_snapshots_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_views" ADD CONSTRAINT "course_views_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_views" ADD CONSTRAINT "course_views_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_refund_tasks" ADD CONSTRAINT "manual_refund_tasks_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "disputes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "disputes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
