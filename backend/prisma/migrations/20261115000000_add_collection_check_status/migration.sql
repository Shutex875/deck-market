ALTER TABLE "Player" ADD COLUMN "collectionCheckStatus" TEXT;
ALTER TABLE "Player" ADD COLUMN "collectionCheckError" TEXT;
ALTER TABLE "Player" ADD COLUMN "collectionAutoCheck" BOOLEAN NOT NULL DEFAULT true;

UPDATE "Player"
SET "collectionCheckStatus" = 'success'
WHERE "collectionCheckAttemptAt" IS NOT NULL
  AND "collectionCheckedAt" >= "collectionCheckAttemptAt";
