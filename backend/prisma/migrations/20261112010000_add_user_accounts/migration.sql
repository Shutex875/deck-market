BEGIN;

CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

CREATE TABLE "Session" (
    "tokenHash" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

ALTER TABLE "Player" ADD COLUMN "ownerId" TEXT REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "new_GameProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "playerScore" INTEGER NOT NULL DEFAULT 0,
    "computerScore" INTEGER NOT NULL DEFAULT 0,
    "record" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GameProgress_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_GameProgress" ("id", "playerId", "playerScore", "computerScore", "record", "updatedAt")
SELECT "GameProgress"."id", "Player"."id", "playerScore", "computerScore", "record", "GameProgress"."updatedAt"
FROM "GameProgress" JOIN "Player" ON "Player"."name" = "GameProgress"."playerName";

DROP TABLE "GameProgress";
ALTER TABLE "new_GameProgress" RENAME TO "GameProgress";
CREATE UNIQUE INDEX "GameProgress_playerId_key" ON "GameProgress"("playerId");
DROP INDEX "Player_name_key";
CREATE UNIQUE INDEX "Player_ownerId_name_key" ON "Player"("ownerId", "name");

COMMIT;
