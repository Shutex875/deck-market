interface ScoredDeck {
  deckId: string;
  cards: string[];
  score: number;
}

interface Combination<Deck> {
  decks: Deck[];
  totalScore: number;
  avgScore: number;
}

export function findClanWarCombinations<Deck extends ScoredDeck>(
  decks: Deck[],
  requiredIds: ReadonlySet<string>,
  limit: number,
): Combination<Deck>[] {
  const candidates = decks.map(deck => {
    const cards = new Set(deck.cards);
    return {
      deck,
      required: requiredIds.has(deck.deckId),
      hasDuplicateCards: cards.size !== deck.cards.length,
    };
  });
  const best: Combination<Deck>[] = [];
  const selected: Deck[] = [];
  const usedCards = new Set<string>();

  function search(start: number, slots: number, requiredLeft: number, totalScore: number): void {
    if (requiredLeft > slots) return;

    if (slots === 0) {
      if (best.length === limit && totalScore <= best[limit - 1].totalScore) return;

      // Visit combinations in input order and insert after existing ties.
      let index = best.length;
      while (index > 0 && totalScore > best[index - 1].totalScore) index--;
      best.splice(index, 0, {
        decks: [...selected],
        totalScore,
        avgScore: totalScore / selected.length,
      });
      if (best.length > limit) best.pop();
      return;
    }

    for (let index = start; index <= candidates.length - slots; index++) {
      const { deck, required, hasDuplicateCards } = candidates[index];
      if ((required || requiredLeft < slots) &&
          !hasDuplicateCards &&
          !deck.cards.some(card => usedCards.has(card))) {
        selected.push(deck);
        for (const card of deck.cards) usedCards.add(card);
        search(index + 1, slots - 1, requiredLeft - Number(required), totalScore + deck.score);
        for (const card of deck.cards) usedCards.delete(card);
        selected.pop();
      }
      // Choosing a later candidate here would skip a required deck.
      if (required) break;
    }
  }

  for (let size = Math.min(4, decks.length); size >= 2; size--) {
    search(0, size, requiredIds.size, 0);
    if (best.length > 0) break;
  }

  return best;
}
