import { load } from 'cheerio';
import { ALL_CARDS } from '../config/cards';

const knownCards = new Set(ALL_CARDS);
const deckSelectors = [
  '.deck-list-item', '.deck-item', '.deck-card', '.deck', '[data-testid="deck"]',
  '.col-lg-4 .card', '.deck-preview', '.deck-card-container',
];

interface DeckshopDeck {
  name: string;
  cards: string[];
  tier: string | null;
  winRate: number | null;
  sampleSize: number | null;
  gameMode: string | null;
}

export function parseDeckshopDecks(html: string): DeckshopDeck[] {
  const $ = load(html);
  for (const selector of deckSelectors) {
    const decks: DeckshopDeck[] = [];
    $(selector).each((index, element) => {
      const deck = $(element);
      const cards: string[] = [];
      deck.find('.card-name, .card, .deck-card, .card-img-alt, img[alt]').each((_, cardElement) => {
        const card = $(cardElement);
        const label = card.text().trim() || card.attr('alt') || '';
        const name = label.replace(/[^a-zA-Z ]/g, '').trim();
        if (knownCards.has(name)) cards.push(name);
      });
      if (cards.length !== 8) return;

      const winRate = Number.parseFloat(deck.find('.win-rate, .winrate').first().text().trim().replace(',', '.'));
      const sample = deck.attr('data-sample-size') ?? deck.attr('data-battle-count') ??
        deck.find('.sample-size, .battle-count, .match-count').first().text().trim();
      const sampleSize = /^\d+(?:[\s,]\d{3})*$/.test(sample) ? Number(sample.replace(/[\s,]/g, '')) : null;
      decks.push({
        name: deck.find('.deck-name, .title, h4, h5').first().text().trim() || `Колода ${index + 1}`,
        cards,
        tier: deck.find('.tier, .deck-tier, .badge').first().text().trim() || null,
        winRate: winRate >= 0 && winRate <= 100 ? winRate : null,
        sampleSize: sampleSize !== null && sampleSize > 0 && sampleSize <= 2147483647 ? sampleSize : null,
        gameMode: deck.attr('data-game-mode')?.trim().slice(0, 80) || null,
      });
    });
    if (decks.length > 0) return decks;
  }
  return [];
}
