-- Lives et replays — arbitrages 31 à 43, 46, 51, 55.

-- Arbitrage 32 — un live appartient à une communauté, jamais à une ressource.
-- `Course.livekitRoomName` désignait une salle rattachée à une ressource : c'est
-- exactement ce que l'arbitrage exclut. Le champ n'était plus référencé nulle
-- part dans le code ; il figurait à la dette technique depuis deux relevés.
ALTER TABLE "courses" DROP COLUMN "livekitRoomName";

CREATE TYPE "LiveSessionStatus" AS ENUM ('SCHEDULED', 'LIVE', 'ENDED', 'CANCELED');
CREATE TYPE "ReplayStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED', 'PURGED');

CREATE TABLE "live_sessions" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scheduledStartAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "status" "LiveSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    -- Nommée à la création et jamais devinée : deviner une clé est exactement
    -- ce qui a coûté la chaîne de contenu des ressources.
    "roomName" TEXT NOT NULL,
    "egressId" TEXT,
    "peakParticipants" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "live_participants" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    -- Verrou de l'animateur (arbitrage 35), pas l'état du micro. Le lever rend
    -- la commande au participant, il ne rallume rien (arbitrage 41).
    "mutedByHost" BOOLEAN NOT NULL DEFAULT false,
    -- Horodatage et non booléen : c'est lui qui ordonne la file (arbitrage 36).
    "handRaisedAt" TIMESTAMP(3),

    CONSTRAINT "live_participants_pkey" PRIMARY KEY ("id")
);

-- Arbitrage 42 — le salon du live est conservé et rattaché au replay. Ce n'est
-- pas un canal éphémère, et il entre dans le périmètre de modération.
CREATE TABLE "live_messages" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "replays" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    -- Arbitrage 34 : c'est la date du live qui fait foi, pas celle de la mise en
    -- ligne. C'est elle que croise l'accès résiduel d'un ancien membre.
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "durationSeconds" INTEGER,
    "s3Key" TEXT,
    -- BIGINT : une heure d'enregistrement dépasse la capacité d'un entier 32
    -- bits. Même leçon que `courses.contentSizeBytes`, apprise une fois.
    "sizeBytes" BIGINT,
    "status" "ReplayStatus" NOT NULL DEFAULT 'PROCESSING',
    -- Arbitrage 51 — purge à 24 mois. La date est portée et non recalculée : une
    -- règle qui change ne doit pas effacer rétroactivement ce qui était promis.
    "purgeAt" TIMESTAMP(3) NOT NULL,
    "purgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "replays_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "live_sessions_roomName_key" ON "live_sessions"("roomName");
CREATE INDEX "live_sessions_communityId_scheduledStartAt_idx" ON "live_sessions"("communityId", "scheduledStartAt");
CREATE INDEX "live_sessions_status_scheduledStartAt_idx" ON "live_sessions"("status", "scheduledStartAt");

-- Une seule ligne de présence par personne et par session : rejoindre deux fois
-- reprend la même, avec sa main levée et son verrou de micro.
CREATE UNIQUE INDEX "live_participants_sessionId_userId_key" ON "live_participants"("sessionId", "userId");
CREATE INDEX "live_participants_sessionId_handRaisedAt_idx" ON "live_participants"("sessionId", "handRaisedAt");

CREATE INDEX "live_messages_sessionId_createdAt_idx" ON "live_messages"("sessionId", "createdAt");

-- Arbitrage 38 — tout live est enregistré, il existe donc au plus un replay par
-- session, et jamais deux.
CREATE UNIQUE INDEX "replays_sessionId_key" ON "replays"("sessionId");
CREATE INDEX "replays_communityId_recordedAt_idx" ON "replays"("communityId", "recordedAt");
CREATE INDEX "replays_status_purgeAt_idx" ON "replays"("status", "purgeAt");

ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_communityId_fkey"
    FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_trainerId_fkey"
    FOREIGN KEY ("trainerId") REFERENCES "trainer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "live_participants" ADD CONSTRAINT "live_participants_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "live_participants" ADD CONSTRAINT "live_participants_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "live_messages" ADD CONSTRAINT "live_messages_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "live_messages" ADD CONSTRAINT "live_messages_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "replays" ADD CONSTRAINT "replays_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "replays" ADD CONSTRAINT "replays_communityId_fkey"
    FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "replays" ADD CONSTRAINT "replays_trainerId_fkey"
    FOREIGN KEY ("trainerId") REFERENCES "trainer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
