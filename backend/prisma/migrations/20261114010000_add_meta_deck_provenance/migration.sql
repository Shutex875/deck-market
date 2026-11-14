ALTER TABLE "MetaDeck" ADD COLUMN "dataKind" TEXT;
ALTER TABLE "MetaDeck" ADD COLUMN "gameMode" TEXT;
ALTER TABLE "MetaDeck" ADD COLUMN "dataDate" TEXT;
ALTER TABLE "MetaDeck" ADD COLUMN "sampleSize" INTEGER;

UPDATE "MetaDeck"
SET "dataKind" = 'top-ladder', "gameMode" = 'Top Ladder'
WHERE "externalId" LIKE 'top-ladder:%';
