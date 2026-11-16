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
  minimumSize = 2,
  requiredCards: ReadonlySet<string> = new Set(),
  canExtend?: (selected: readonly Deck[], totalScore: number) => boolean,
): Combination<Deck>[] {
  if ([...requiredIds].some(id => !decks.some(deck => deck.deckId === id))) return [];
  const cardKey = (card: string) => card === 'Log' ? 'The Log' : card;
  const requiredCardKeys = [...requiredCards].map(cardKey);
  const cardBits = new Map<string, bigint>();
  function getCardBit(card: string) {
    let bit = cardBits.get(card);
    if (bit === undefined) {
      bit = 1n << BigInt(cardBits.size);
      cardBits.set(card, bit);
    }
    return bit;
  }
  const requiredMask = requiredCardKeys.reduce((mask, card) => mask | getCardBit(card), 0n);
  const candidates = decks.map(deck => {
    const cards = new Set(deck.cards.map(cardKey));
    return {
      deck,
      mask: [...cards].reduce((mask, card) => mask | getCardBit(card), 0n),
      required: requiredIds.has(deck.deckId),
      hasDuplicateCards: cards.size !== deck.cards.length,
    };
  });
  const best: Combination<Deck>[] = [];
  const selected: Deck[] = [];
  const suffixMasks = Array<bigint>(candidates.length + 1).fill(0n);
  const suffixMaxScores = Array<number>(candidates.length + 1).fill(-Infinity);
  for (let index = candidates.length - 1; index >= 0; index--) {
    const { mask, deck } = candidates[index];
    suffixMasks[index] = suffixMasks[index + 1] | mask;
    suffixMaxScores[index] = Math.max(suffixMaxScores[index + 1], deck.score);
  }

  function search(start: number, slots: number, requiredLeft: number, totalScore: number, usedMask: bigint): void {
    if (requiredLeft > slots) return;
    if (requiredMask !== 0n) {
      const possibleCards = slots === 0 ? usedMask : usedMask | suffixMasks[start];
      if ((possibleCards & requiredMask) !== requiredMask) return;
    }
    if (best.length === limit) {
      // Add in the same order as search to preserve the floating-point upper bound.
      let upperBound = totalScore;
      for (let slot = 0; slot < slots; slot++) upperBound += suffixMaxScores[start];
      // Later leaves lose ties by input order.
      if (upperBound <= best[limit - 1].totalScore) return;
    }

    if (slots === 0) {
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
      const { deck, mask, required, hasDuplicateCards } = candidates[index];
      if ((required || requiredLeft < slots) &&
          !hasDuplicateCards &&
          (mask & usedMask) === 0n) {
        selected.push(deck);
        const nextScore = totalScore + deck.score;
        if (!canExtend || canExtend(selected, nextScore)) {
          search(index + 1, slots - 1, requiredLeft - Number(required), nextScore, usedMask | mask);
        }
        selected.pop();
      }
      // Choosing a later candidate here would skip a required deck.
      if (required) break;
    }
  }

  for (let size = Math.min(4, decks.length); size >= minimumSize; size--) {
    search(0, size, requiredIds.size, 0, 0n);
    if (best.length > 0) break;
  }

  return best;
}
