import { cardDataMap } from '../config/cards';
import { evoPriorities, heroPriorities, championPriorities } from '../priorities';

export const fixDeckTemplate = (cards: string[], slot2Type: string | null): { cards: string[]; slot2Type: string | null } => {
  const newCards = [...cards];
  let newSlot2Type = slot2Type;

  // Слот 0 — эво
  const card0 = cardDataMap[newCards[0]];
  if (!card0?.evoFile) {
    let bestEvoIndex = -1;
    let bestPriority = Infinity;
    for (let i = 2; i < 8; i++) {
      const card = cardDataMap[newCards[i]];
      if (card?.evoFile) {
        const priority = evoPriorities[newCards[i]] ?? 999;
        if (priority < bestPriority) {
          bestPriority = priority;
          bestEvoIndex = i;
        }
      }
    }
    if (bestEvoIndex !== -1) {
      [newCards[0], newCards[bestEvoIndex]] = [newCards[bestEvoIndex], newCards[0]];
    }
  }

  // Слот 1 — герой/чемпион (новый)
  const card1 = cardDataMap[newCards[1]];
  if (!card1?.heroFile && !card1?.champion) {
    let bestHeroIndex = -1;
    let bestPriority = Infinity;
    for (let i = 0; i < 8; i++) {
      if (i === 1) continue;
      const card = cardDataMap[newCards[i]];
      if (card?.heroFile || card?.champion) {
        let priority = 999;
        if (card.heroFile) priority = heroPriorities[newCards[i]] ?? 999;
        else if (card.champion) priority = championPriorities[newCards[i]] ?? 999;
        if (priority < bestPriority) {
          bestPriority = priority;
          bestHeroIndex = i;
        }
      }
    }
    if (bestHeroIndex !== -1) {
      [newCards[1], newCards[bestHeroIndex]] = [newCards[bestHeroIndex], newCards[1]];
    }
  }

  // Слот 2 — безумный
  const card2 = cardDataMap[newCards[2]];
  const hasSpecial = card2?.evoFile || card2?.heroFile || card2?.champion;
  if (!hasSpecial) {
    let bestHeroIndex = -1;
    let bestPriority = Infinity;
    for (let i = 3; i < 8; i++) {
      const card = cardDataMap[newCards[i]];
      if (card?.heroFile) {
        const priority = heroPriorities[newCards[i]] ?? 999;
        if (priority < bestPriority) {
          bestPriority = priority;
          bestHeroIndex = i;
        }
      }
    }
    if (bestHeroIndex !== -1) {
      [newCards[2], newCards[bestHeroIndex]] = [newCards[bestHeroIndex], newCards[2]];
      newSlot2Type = 'hero';
    } else {
      let bestEvoIndex = -1;
      let bestPriority = Infinity;
      for (let i = 3; i < 8; i++) {
        const card = cardDataMap[newCards[i]];
        if (card?.evoFile) {
          const priority = evoPriorities[newCards[i]] ?? 999;
          if (priority < bestPriority) {
            bestPriority = priority;
            bestEvoIndex = i;
          }
        }
      }
      if (bestEvoIndex !== -1) {
        [newCards[2], newCards[bestEvoIndex]] = [newCards[bestEvoIndex], newCards[2]];
        newSlot2Type = 'evo';
      }
    }
  } else {
    const card = cardDataMap[newCards[2]];
    if (card?.evoFile) newSlot2Type = 'evo';
    else if (card?.heroFile || card?.champion) newSlot2Type = 'hero';
    else newSlot2Type = null;
  }

  return { cards: newCards, slot2Type: newSlot2Type };
};

export const calculatePlayerBonus = (
  cards: string[],
  slot2Type: string | null,
  levels: Record<string, number>,
  evolutions: string[],
  heroes: string[]
): {
  bonus: number;
  replacements: { slot: number; original: string; replacement: string }[];
  slotStatus: { slot: number; type: 'evo' | 'hero' | 'champion' | 'none'; active: boolean }[];
  changedCards: string[];
} => {
  const currentCards = [...cards];
  const usedIndices = new Set<number>();
  let bonus = 0;
  const replacements: { slot: number; original: string; replacement: string }[] = [];
  const slotStatus: { slot: number; type: 'evo' | 'hero' | 'champion' | 'none'; active: boolean }[] = [];

  const findBestReplacement = (
    slotIndices: number[],
    filterFn: (cardId: string) => boolean,
    priorityMap: Record<string, number>
  ): { index: number; cardId: string } | null => {
    let bestIndex = -1;
    let bestPriority = Infinity;
    for (const idx of slotIndices) {
      if (usedIndices.has(idx)) continue;
      const cardId = currentCards[idx];
      if (!filterFn(cardId)) continue;
      const priority = priorityMap[cardId] ?? 999;
      if (priority < bestPriority) {
        bestPriority = priority;
        bestIndex = idx;
      }
    }
    if (bestIndex === -1) return null;
    return { index: bestIndex, cardId: currentCards[bestIndex] };
  };

  for (const slotIdx of [0, 1, 2]) {
    const cardId = currentCards[slotIdx];
    const cardData = cardDataMap[cardId];
    let type: 'evo' | 'hero' | 'champion' | 'none' = 'none';
    let active = false;

    if (slotIdx === 0) {
      if (cardData?.evoFile && evolutions.includes(cardId)) {
        bonus += 0.5;
        type = 'evo';
        active = true;
      } else {
        const replacement = findBestReplacement(
          [3, 4, 5, 6, 7],
          (id) => {
            const data = cardDataMap[id];
            return data?.evoFile !== undefined && evolutions.includes(id);
          },
          evoPriorities
        );
        if (replacement) {
          [currentCards[slotIdx], currentCards[replacement.index]] = [currentCards[replacement.index], currentCards[slotIdx]];
          usedIndices.add(slotIdx);
          usedIndices.add(replacement.index);
          bonus += 0.3;
          replacements.push({ slot: slotIdx, original: cardId, replacement: replacement.cardId });
          type = 'evo';
          active = true;
        } else {
          type = 'none';
          active = false;
        }
      }
    } else if (slotIdx === 1) {
      const isHero = cardData?.heroFile !== undefined;
      const isChampion = cardData?.champion === true;
      const hasRequired = (isHero || isChampion) && heroes.includes(cardId);
      if (hasRequired) {
        bonus += 0.5;
        type = isChampion ? 'champion' : 'hero';
        active = true;
      } else {
        const replacement = findBestReplacement(
          [3, 4, 5, 6, 7],
          (id) => {
            const data = cardDataMap[id];
            if (!data) return false;
            if (isHero) return data.heroFile !== undefined && heroes.includes(id);
            if (isChampion) return data.champion === true && heroes.includes(id);
            return false;
          },
          isHero ? heroPriorities : championPriorities
        );
        if (replacement) {
          [currentCards[slotIdx], currentCards[replacement.index]] = [currentCards[replacement.index], currentCards[slotIdx]];
          usedIndices.add(slotIdx);
          usedIndices.add(replacement.index);
          bonus += 0.3;
          replacements.push({ slot: slotIdx, original: cardId, replacement: replacement.cardId });
          type = isChampion ? 'champion' : 'hero';
          active = true;
        } else {
          type = 'none';
          active = false;
        }
      }
    } else if (slotIdx === 2) {
      const hasEvoFile = cardData?.evoFile !== undefined;
      const hasHeroFile = cardData?.heroFile !== undefined;
      const hasChampion = cardData?.champion === true;

      let expectedType: 'evo' | 'hero' | 'champion' | null = null;
      if (slot2Type === 'evo') expectedType = 'evo';
      else if (slot2Type === 'hero') expectedType = 'hero';
      else {
        if (hasEvoFile && evolutions.includes(cardId)) expectedType = 'evo';
        else if (hasHeroFile && heroes.includes(cardId)) expectedType = 'hero';
        else if (hasChampion && heroes.includes(cardId)) expectedType = 'champion';
      }

      if (expectedType) {
        let hasRequired = false;
        if (expectedType === 'evo') hasRequired = evolutions.includes(cardId);
        else if (expectedType === 'hero') hasRequired = heroes.includes(cardId);
        else if (expectedType === 'champion') hasRequired = heroes.includes(cardId);

        if (!hasRequired) {
          if (expectedType === 'evo' && hasHeroFile && heroes.includes(cardId)) {
            expectedType = 'hero';
            hasRequired = true;
          } else if (expectedType === 'hero' && hasEvoFile && evolutions.includes(cardId)) {
            expectedType = 'evo';
            hasRequired = true;
          }
        }

        if (hasRequired) {
          bonus += 0.5;
          type = expectedType;
          active = true;
        } else {
          let replacement = null;
          if (expectedType === 'hero' || expectedType === 'champion') {
            replacement = findBestReplacement(
              [3, 4, 5, 6, 7],
              (id) => {
                const data = cardDataMap[id];
                if (expectedType === 'hero') return data?.heroFile !== undefined && heroes.includes(id);
                else return data?.champion === true && heroes.includes(id);
              },
              expectedType === 'hero' ? heroPriorities : championPriorities
            );
          } else if (expectedType === 'evo') {
            replacement = findBestReplacement(
              [3, 4, 5, 6, 7],
              (id) => {
                const data = cardDataMap[id];
                return data?.evoFile !== undefined && evolutions.includes(id);
              },
              evoPriorities
            );
          }

          if (replacement) {
            [currentCards[slotIdx], currentCards[replacement.index]] = [currentCards[replacement.index], currentCards[slotIdx]];
            usedIndices.add(slotIdx);
            usedIndices.add(replacement.index);
            bonus += 0.3;
            replacements.push({ slot: slotIdx, original: cardId, replacement: replacement.cardId });
            type = expectedType;
            active = true;
          } else {
            type = 'none';
            active = false;
          }
        }
      } else {
        let replacement = findBestReplacement(
          [3, 4, 5, 6, 7],
          (id) => {
            const data = cardDataMap[id];
            return data?.heroFile !== undefined && heroes.includes(id);
          },
          heroPriorities
        );
        if (replacement) {
          [currentCards[slotIdx], currentCards[replacement.index]] = [currentCards[replacement.index], currentCards[slotIdx]];
          usedIndices.add(slotIdx);
          usedIndices.add(replacement.index);
          bonus += 0.3;
          replacements.push({ slot: slotIdx, original: cardId, replacement: replacement.cardId });
          type = 'hero';
          active = true;
        } else {
          replacement = findBestReplacement(
            [3, 4, 5, 6, 7],
            (id) => {
              const data = cardDataMap[id];
              return data?.evoFile !== undefined && evolutions.includes(id);
            },
            evoPriorities
          );
          if (replacement) {
            [currentCards[slotIdx], currentCards[replacement.index]] = [currentCards[replacement.index], currentCards[slotIdx]];
            usedIndices.add(slotIdx);
            usedIndices.add(replacement.index);
            bonus += 0.3;
            replacements.push({ slot: slotIdx, original: cardId, replacement: replacement.cardId });
            type = 'evo';
            active = true;
          } else {
            type = 'none';
            active = false;
          }
        }
      }
    }

    slotStatus.push({ slot: slotIdx, type, active });
  }

  return { bonus, replacements, slotStatus, changedCards: currentCards };
};
