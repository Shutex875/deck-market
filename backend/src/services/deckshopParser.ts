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

      const winRate = Number.parseFloat(deck.find('.win-rate, .winrate, .percentage').first().text().trim());
      decks.push({
        name: deck.find('.deck-name, .title, h4, h5').first().text().trim() || `Колода ${index + 1}`,
        cards,
        tier: deck.find('.tier, .deck-tier, .badge').first().text().trim() || null,
        winRate: Number.isFinite(winRate) ? winRate : null,
      });
    });
    if (decks.length > 0) return decks;
  }
  return [];
}
