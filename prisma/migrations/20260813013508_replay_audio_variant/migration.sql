-- AlterTable
ALTER TABLE "live_sessions" ADD COLUMN     "audioEgressId" TEXT;

-- AlterTable
ALTER TABLE "replays" ADD COLUMN     "audioS3Key" TEXT,
ADD COLUMN     "audioSizeBytes" BIGINT;
