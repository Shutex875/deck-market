import axios, { isAxiosError } from 'axios';
import { createCachedRead } from './cachedRead';
import { currentSessionRevision, notifySessionExpired, onSessionChanged, requestHeader } from './session';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json', ...requestHeader },
});

const requestRevisions = new WeakMap<object, number>();
api.interceptors.request.use(config => {
  requestRevisions.set(config, currentSessionRevision());
  return config;
}, undefined, { synchronous: true });
api.interceptors.response.use(undefined, error => {
  if (isAxiosError(error) && error.response?.headers['x-bastdecks-session'] === 'expired' && error.config) {
    const revision = requestRevisions.get(error.config);
    if (revision !== undefined) notifySessionExpired(revision);
  }
  return Promise.reject(error);
});

export interface AdminOverview {
  totals: { users: number; players: number; metaDecks: number; savedDecks: number };
  accounts: { id: string; username: string; createdAt: string; profiles: number; isOwner: boolean }[];
  pageCount: number;
}

export const getAdminOverview = (page: number, signal: AbortSignal) =>
  api.get<AdminOverview>('/admin/overview', { params: { page }, signal }).then(res => res.data);

// === Типы ===
export interface Player {
  id: string;
  name: string;
  tag: string | null;
  levels: string;
  evolutions: string;
  heroes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClashRoyalePlayerStats {
  tag: string;
  name: string;
  expLevel: number;
  trophies: number;
  bestTrophies: number;
  wins: number;
  losses: number;
  battleCount: number;
  arena?: {
    id: number;
    name: string;
  };
  clan?: {
    tag: string;
    name: string;
  };
  cards?: ClashRoyaleCard[];
  currentDeck?: ClashRoyaleCard[];
  evolutions?: Array<string | { name?: string; card?: { name?: string } }>;
  heroes?: Array<string | { name?: string; card?: { name?: string } }>;
  towerTroops?: ClashRoyaleCard[] | Record<string, unknown>;
  towerTroop?: ClashRoyaleCard | string;
}

export interface ClashRoyaleCard {
  name: string;
  level?: number;
  maxLevel?: number;
  count?: number;
  evolutionLevel?: number;
  evoLevel?: number;
  isEvolved?: boolean;
  isEvolutionUnlocked?: boolean;
  heroLevel?: number | string;
  isHero?: boolean;
  isHeroUnlocked?: boolean;
  variant?: string;
  evolution?: {
    level?: number;
    unlocked?: boolean;
    isUnlocked?: boolean;
  };
  hero?: {
    level?: number | string;
    unlocked?: boolean;
    isUnlocked?: boolean;
  };
}

export const getClashRoyalePlayerStats = (playerTag: string) => {
  const normalizedTag = playerTag.trim().startsWith('#')
    ? playerTag.trim()
    : `#${playerTag.trim()}`;

  return api
    .get<ClashRoyalePlayerStats>(`/player-stats/${encodeURIComponent(normalizedTag)}`)
    .then(res => res.data);
};

export interface MetaDeck {
  id: string;
  name: string;
  cards: string;
  description?: string | null;
  avgElixir: number | null;
  tier: string | null;
  winRate: number | null;
  categoryId: string;
  sourceId: string;
  sourceUrl: string | null;
  isActive: boolean;
  createdAt: string;
  slot2Type?: 'evo' | 'hero' | null;
}

export type RecommendationMode = 'account' | 'meta';

export interface RecommendResponse {
  success: boolean;
  totalDecks: number;
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
    replacements?: { slot: number; original: string; replacement: string }[];
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

export const getSavedDecks = (playerName: string, signal?: AbortSignal) =>
  api.get<SavedDeck[]>('/saved-decks', { params: { playerName }, signal }).then(res => res.data);

export const saveDeck = (playerName: string, name: string, cards: string[]) =>
  api.post<SavedDeck>('/saved-decks', { playerName, name, cards }).then(res => res.data);

export const transferSavedDeck = (id: string, fromPlayer: string, toPlayer: string, mode: 'copy' | 'move') =>
  api.post<SavedDeck>(`/saved-decks/${encodeURIComponent(id)}/transfer`, { fromPlayer, toPlayer, mode })
    .then(res => res.data);

export const deleteSavedDeck = (id: string, playerName: string) =>
  api.delete(`/saved-decks/${id}`, { params: { playerName } }).then(res => res.data);

export const diagnoseDeck = (playerName: string, deckId: string, signal?: AbortSignal) =>
  api.post<{
    success: boolean;
    deckName: string;
    totalGold: number;
    targetLevel: number;
    details: { card: string; currentLevel: number; neededGold: number }[];
  }>('/diagnose-deck', { playerName, deckId }, { signal }).then(res => res.data);

// === Player API ===
const players = createCachedRead(() => api.get<Player[]>('/players').then(res => res.data));
onSessionChanged(players.invalidate);
export const getPlayers = players.read;
export const getPlayer = (name: string, signal?: AbortSignal) =>
  api.get<Player>(`/players/${encodeURIComponent(name)}`, { signal }).then(res => res.data);
export const savePlayer = (data: Omit<Player, 'id' | 'createdAt' | 'updatedAt'>, existingName?: string) =>
  (existingName ? api.put(`/players/${encodeURIComponent(existingName)}`, data) : api.post<Player>('/players', data)).then(() => {
    players.invalidate();
  });
export const deletePlayer = (name: string) => api.delete(`/players/${encodeURIComponent(name)}`).then(res => {
  players.invalidate();
  return res.data;
});

// === MetaDeck API ===
export type MetaDeckSortBy = 'name' | 'createdAt' | 'avgElixir';
export type SortOrder = 'asc' | 'desc';
export const getMetaDecks = (sortBy: MetaDeckSortBy = 'name', order: SortOrder = 'asc') =>
  api.get<MetaDeckFull[]>('/meta-decks', { params: { sortBy, order } }).then(res => res.data);
export const createMetaDeck = (data: {
  name: string;
  cards: string[];
  description?: string;
  slot2Type?: 'evo' | 'hero';
  tier?: string;
  winRate?: number;
  categoryId: string;
  sourceId: string;
  sourceUrl?: string;
}) => api.post<MetaDeck>('/meta-decks', data).then(res => res.data);
export const deleteMetaDeck = (id: string) => api.delete(`/meta-decks/${id}`).then(res => res.data);
export const importDecksFromDeckshop = (category: string = 'popular') =>
  api.post('/meta-decks/import-deckshop', { category }).then(res => res.data).finally(invalidateDeckLookups);
export async function importMockDecks() {
  const revision = currentSessionRevision();
  const response = await fetch(`${API_BASE}/meta-decks/import-mock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...requestHeader },
    body: JSON.stringify({}),
  }).finally(invalidateDeckLookups);
  if (response.headers.get('X-BastDecks-Session') === 'expired') notifySessionExpired(revision);
  return response;
}
export interface RecognizedDeckCard {
  id: string;
  name: string;
  elixirCost: number | null;
  isEvolution: boolean;
  isChampion: boolean;
  isHero: boolean;
}

export const checkDeckDuplicates = (cards: string[], signal?: AbortSignal) =>
  api.post<{ names: string[] }>('/meta-decks/check-duplicates', { cards }, { signal })
    .then(res => res.data.names);

export const recognizeDeckScreenshot = async (file: File, signal?: AbortSignal): Promise<RecognizedDeckCard[]> => {
  let uploadFile: Blob = file;
  if (file.size > 1.5 * 1024 * 1024 && typeof createImageBitmap === 'function') {
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(file);
      const maxDimension = 1600;
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const compressed = await new Promise<Blob | null>(resolve =>
          canvas.toBlob(resolve, 'image/jpeg', 0.88)
        );
        if (compressed && compressed.size < file.size) uploadFile = compressed;
      }
    } finally {
      bitmap?.close();
    }
  }

  const image = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Не удалось прочитать файл изображения'));
    };
    reader.onerror = () => reject(reader.error || new Error('Не удалось прочитать файл изображения'));
    reader.readAsDataURL(uploadFile);
  });

  const response = await api.post<{ cards: RecognizedDeckCard[] }>(
    '/meta-decks/recognize-image',
    { image },
    { timeout: 60000, signal }
  );
  return response.data.cards;
};

export interface MetaDeckFull extends MetaDeck {
  category: { id: string; name: string };
  source: { id: string; name: string };
}

export const getMetaDeck = (id: string) =>
  api.get<MetaDeckFull>(`/meta-decks/${id}`).then(res => res.data);

export const updateMetaDeck = (id: string, data: {
  name: string;
  cards: string[];
  description?: string;
  slot2Type?: 'evo' | 'hero';
  tier?: string;
  winRate?: number;
  categoryId: string;
  sourceId: string;
  sourceUrl?: string;
}) => api.put<MetaDeck>(`/meta-decks/${id}`, data).then(res => res.data);

// === Categories ===
export interface Category {
  id: string;
  name: string;
  createdAt: string;
}

const categories = createCachedRead(() => api.get<Category[]>('/categories').then(res => res.data));
export const getCategories = categories.read;
export const createCategory = (name: string) => api.post<Category>('/categories', { name }).then(res => {
  categories.invalidate();
  return res.data;
});
export const deleteCategory = (id: string) => api.delete(`/categories/${id}`).then(res => {
  categories.invalidate();
  return res.data;
});

// === Sources ===
export interface Source {
  id: string;
  name: string;
  createdAt: string;
}

const sources = createCachedRead(() => api.get<Source[]>('/sources').then(res => res.data));
export const getSources = sources.read;
export const createSource = (name: string) => api.post<Source>('/sources', { name }).then(res => {
  sources.invalidate();
  return res.data;
});
export const deleteSource = (id: string) => api.delete(`/sources/${id}`).then(res => {
  sources.invalidate();
  return res.data;
});

function invalidateDeckLookups() {
  categories.invalidate();
  sources.invalidate();
}

// === Рекомендации ===
export const recommendDecks = (
  playerName: string,
  limit: number = 100,
  includeCards: string[] = [],
  excludeCards: string[] = [],
  signal?: AbortSignal,
  mode?: RecommendationMode,
) =>
  api.post<RecommendResponse>('/recommend', { playerName, limit, includeCards, excludeCards, mode }, { signal })
    .then(res => res.data);

export const recommendCW = (
  playerName: string,
  limit: number = 10,
  includeCards?: string[],
  excludeCards?: string[],
  requiredDeckIds?: string[],
  signal?: AbortSignal,
) =>
  api.post<CWResponse>('/recommend-cw', {
    playerName,
    limit,
    includeCards,
    excludeCards,
    requiredDeckIds,
  }, { signal }).then(res => res.data);

export const diagnose = (playerName: string, targetLevel = 13) =>
  api.post<DiagnoseResponse>('/diagnose', { playerName, targetLevel }).then(res => res.data);
