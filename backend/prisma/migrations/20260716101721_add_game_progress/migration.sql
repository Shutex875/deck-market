-- CreateTable
CREATE TABLE "GameProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerName" TEXT NOT NULL,
    "playerScore" INTEGER NOT NULL DEFAULT 0,
    "computerScore" INTEGER NOT NULL DEFAULT 0,
    "record" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GameProgress_playerName_fkey" FOREIGN KEY ("playerName") REFERENCES "Player" ("name") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "GameProgress_playerName_key" ON "GameProgress"("playerName");
