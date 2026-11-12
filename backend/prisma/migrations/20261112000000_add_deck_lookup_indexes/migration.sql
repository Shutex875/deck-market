CREATE INDEX "SavedDeck_playerId_createdAt_idx" ON "SavedDeck"("playerId", "createdAt");
CREATE INDEX "MetaDeck_categoryId_idx" ON "MetaDeck"("categoryId");
CREATE INDEX "MetaDeck_sourceId_idx" ON "MetaDeck"("sourceId");
