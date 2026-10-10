import axios from 'axios';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// === Типы ===
export interface Player {
  id: string;
  name: string;
  levels: string;
  evolutions: string;
  heroes: string;
  createdAt: string;
  updatedAt: string;
}

export interface MetaDeck {
  id: string;
  name: string;
  cards: string;
  tier: string | null;
  winRate: number | null;
  source: string;
  isActive: boolean;
  createdAt: string;
  slot2Type?: 'evo' | 'hero' | null;
}

export interface RecommendResponse {
  success: boolean;
  decks: {
    id: string;
    name: string;
    cards: string[];
    cardLevels: Record<string, number>;
    averageLevel: number;
    missingCardsCount: number;
    score: number;
    bonus: number;
    tier: string | null;
    winRate: number | null;
    category?: { name: string };
    source?: { name: string };
    slot2Type?: 'evo' | 'hero' | null;
    slotStatus?: { slot: number; type: 'evo' | 'hero' | 'champion' | 'none'; active: boolean }[];
  }[];
  playerName: string;
}

export interface DiagnoseResponse {
  success: boolean;
  playerName: string;
  targetLevel: number;
  totalGold: number;
  details: { card: string; currentLevel: number; neededGold: number }[];
}

// === CW Response ===
export interface CWResponse {
  success: boolean;
  combinations: {
    decks: {
      deckId: string;
      name: string;
      cards: string[];
      averageLevel: number;
      bonus: number;
      score: number;
      missingCount: number;
      tier?: string;
      winRate?: number;
      slot2Type?: 'evo' | 'hero' | null;
      slotStatus?: { slot: number; type: 'evo' | 'hero' | 'champion' | 'none'; active: boolean }[];
    }[];
    totalScore: number;
    avgScore: number;
  }[];
  totalCombinations: number;
  foundSize: number;
  playerName: string;
  message?: string;
}

// === Saved Decks ===
export interface SavedDeck {
  id: string;
  name: string;
  cards: string; // JSON
  createdAt: string;
}

export const getSavedDecks = (playerName: string) =>
  api.get<SavedDeck[]>(`/saved-decks?playerName=${encodeURIComponent(playerName)}`).then(res => res.data);

export const saveDeck = (playerName: string, name: string, cards: string[]) =>
  api.post<SavedDeck>('/saved-decks', { playerName, name, cards }).then(res => res.data);

export const deleteSavedDeck = (id: string) =>
  api.delete(`/saved-decks/${id}`).then(res => res.data);

export const diagnoseDeck = (playerName: string, deckId: string) =>
  api.post<{
    success: boolean;
    deckName: string;
    totalGold: number;
    targetLevel: number;
    details: { card: string; currentLevel: number; neededGold: number }[];
  }>('/diagnose-deck', { playerName, deckId }).then(res => res.data);

// === Player API ===
export const getPlayers = () => api.get<Player[]>('/players').then(res => res.data);
export const getPlayer = (name: string) => api.get<Player>(`/players/${name}`).then(res => res.data);
export const savePlayer = (data: Omit<Player, 'id' | 'createdAt' | 'updatedAt'>) =>
  api.post<Player>('/players', data).then(res => res.data);
export const deletePlayer = (name: string) => api.delete(`/players/${name}`).then(res => res.data);

// === MetaDeck API ===
export const getMetaDecks = () => api.get<MetaDeck[]>('/meta-decks').then(res => res.data);
export const createMetaDeck = (data: {
  name: string;
  cards: string[];
  slot2Type?: 'evo' | 'hero';
  tier?: string;
  winRate?: number;
  categoryId: string;
  sourceId: string;
  sourceUrl?: string;
}) => api.post<MetaDeck>('/meta-decks', data).then(res => res.data);
export const deleteMetaDeck = (id: string) => api.delete(`/meta-decks/${id}`).then(res => res.data);
export const importDecksFromDeckshop = (category: string = 'popular') =>
  api.post('/meta-decks/import-deckshop', { category }).then(res => res.data);

export interface MetaDeckFull extends MetaDeck {
  category: { id: string; name: string };
  source: { id: string; name: string };
  slot2Type?: 'evo' | 'hero' | null;
}

export const getMetaDeck = (id: string) =>
  api.get<MetaDeckFull>(`/meta-decks/${id}`).then(res => res.data);

export const updateMetaDeck = (id: string, data: {
  name: string;
  cards: string[];
  slot2Type?: 'evo' | 'hero';
  tier?: string;
  winRate?: number;
  categoryId: string;
  sourceId: string;
  sourceUrl?: string;
}) => api.put<MetaDeck>(`/meta-decks/${id}`, data).then(res => res.data);

// Game
export const getGameProgress = async (playerName: string): Promise<{
  playerScore: number;
  computerScore: number;
  record: number;
}> => {
  const res = await fetch(`/api/game-progress/${encodeURIComponent(playerName)}`);
  if (!res.ok) {
    if (res.status === 404) {
      return { playerScore: 0, computerScore: 0, record: 0 };
    }
    throw new Error('Ошибка загрузки прогресса');
  }
  return await res.json();
};

export const saveGameProgress = async (data: {
  playerName: string;
  playerScore: number;
  computerScore: number;
  record: number;
}) => {
  const res = await fetch('/api/game-progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error('Ошибка сохранения прогресса');
  }
  return res.json();
};

// === Categories ===
export interface Category {
  id: string;
  name: string;
  createdAt: string;
}

export const getCategories = () => api.get<Category[]>('/categories').then(res => res.data);
export const createCategory = (name: string) => api.post<Category>('/categories', { name }).then(res => res.data);
export const deleteCategory = (id: string) => api.delete(`/categories/${id}`).then(res => res.data);

// === Sources ===
export interface Source {
  id: string;
  name: string;
  createdAt: string;
}

export const getSources = () => api.get<Source[]>('/sources').then(res => res.data);
export const createSource = (name: string) => api.post<Source>('/sources', { name }).then(res => res.data);
export const deleteSource = (id: string) => api.delete(`/sources/${id}`).then(res => res.data);

// === Рекомендации ===
export const recommendDecks = (playerName: string, limit: number = 100) =>
  api.post<RecommendResponse>('/recommend', { playerName, limit }).then(res => res.data);

export const recommendCW = (
  playerName: string,
  limit: number = 10,
  includeCards?: string[],
  excludeCards?: string[],
  requiredDeckIds?: string[]
) =>
  api.post<CWResponse>('/recommend-cw', {
    playerName,
    limit,
    includeCards,
    excludeCards,
    requiredDeckIds,
  }).then(res => res.data);

export const diagnose = (playerName: string, targetLevel = 13) =>
  api.post<DiagnoseResponse>('/diagnose', { playerName, targetLevel }).then(res => res.data);
