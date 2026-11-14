import { useActivePlayer } from '../context/ActivePlayer';
import ProfileSwitcher from './ProfileSwitcher';
import { useSavedDecks } from '../hooks/useSavedDecks';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import * as Dialog from '@radix-ui/react-dialog';
import { isAxiosError } from 'axios';
import {
  PlusIcon,
  ArrowPathIcon,
  TrashIcon,
  FunnelIcon,
  TagIcon,
  ChartBarIcon,
  TrophyIcon,
  PencilIcon,
  BookmarkIcon,
  CheckIcon,
  XMarkIcon,
  PhotoIcon,
  ArrowUpTrayIcon,
} from '@heroicons/react/24/outline';
import { metaDataLabels, getMetaDecks, deleteMetaDeck, getCategories, Category, saveDeck, transferSavedDeck, deleteSavedDeck, checkDeckDuplicates, recognizeDeckScreenshot, RecognizedDeckCard, MetaDeckSortBy, SortOrder, importMockDecks, type MetaDeckFull } from '../api';
import { CardIcon } from '../utils/cardImages';
import { ALL_CARDS_DATA } from '../data/cards';
import { useTheme } from '../context/ThemeContext';
import DeckFilterModal from './DeckFilterModal';

type CatalogDeck = Omit<MetaDeckFull, 'cards'> & { cards: string[]; composition: string };

const cardsById = new Map(ALL_CARDS_DATA.map(card => [card.id, card]));

function parseDeckCards(value: string): string[] {
  try {
    const cards: unknown = JSON.parse(value);
    return Array.isArray(cards) && cards.every(card => typeof card === 'string') ? cards : [];
  } catch {
    return [];
  }
}

const deckComposition = (cards: string[]) => JSON.stringify([...cards].sort());

const DeckList: React.FC<{ canManageCatalog: boolean; latest?: boolean }> = ({ canManageCatalog, latest = false }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const navigate = useNavigate();
  const screenshotInputRef = useRef<HTMLInputElement>(null);

  const [decks, setDecks] = useState<MetaDeckFull[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sortBy, setSortBy] = useState<MetaDeckSortBy>(latest ? 'createdAt' : 'name');
  const [sortOrder, setSortOrder] = useState<SortOrder>(latest ? 'desc' : 'asc');
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importNotice, setImportNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isScreenshotModalOpen, setIsScreenshotModalOpen] = useState(false);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotCards, setScreenshotCards] = useState<RecognizedDeckCard[]>([]);
  const [screenshotError, setScreenshotError] = useState('');
  const [duplicateCheck, setDuplicateCheck] = useState<{
    cards: RecognizedDeckCard[];
    names: string[] | null;
  } | null>(null);
  const [duplicateRetry, setDuplicateRetry] = useState(0);
  const [recognizingScreenshot, setRecognizingScreenshot] = useState(false);
  const recognitionRequest = useRef<AbortController | null>(null);
  const hasUniqueScreenshotCards = screenshotCards.length === 8 &&
    new Set(screenshotCards.map(card => card.id)).size === 8;
  const currentDuplicateCheck = duplicateCheck?.cards === screenshotCards ? duplicateCheck : null;
  const screenshotDuplicates = currentDuplicateCheck?.names ?? [];
  const checkingScreenshotDuplicates = hasUniqueScreenshotCards && !currentDuplicateCheck;
  const canContinueScreenshot = hasUniqueScreenshotCards && currentDuplicateCheck?.names?.length === 0;

  // Фильтр по картам
  const [includeCards, setIncludeCards] = useState<string[]>([]);
  const [excludeCards, setExcludeCards] = useState<string[]>([]);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  // Состояния для сохранения в избранное
  const { players, activePlayer } = useActivePlayer();
  const selectedPlayerName = activePlayer?.name ?? '';
  const levels: Record<string, number> = useMemo(() => JSON.parse(activePlayer?.levels ?? '{}'), [activePlayer?.levels]);
  const saved = useSavedDecks(selectedPlayerName);
  const savedDecks = saved.decks;
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [savingDeck, setSavingDeck] = useState<CatalogDeck | null>(null);
  const [targetPlayer, setTargetPlayer] = useState('');
  const [saveLoading, setSaveLoading] = useState<'copy' | 'move' | 'remove' | null>(null);
  const [saveError, setSaveError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const otherPlayerDecks = useSavedDecks(isSaveModalOpen && targetPlayer !== selectedPlayerName ? targetPlayer : '');
  const targetDecks = targetPlayer === selectedPlayerName ? saved : otherPlayerDecks;

  const fetchDecks = async () => {
    setLoading(true);
    try {
      const data = await getMetaDecks(sortBy, sortOrder);
      setDecks(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const data = await getCategories();
      setCategories(data);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchDecks();
  }, [sortBy, sortOrder]);

  useEffect(() => {
    setIsSaveModalOpen(false);
    setSaveNotice('');
  }, [activePlayer?.id]);

  useEffect(() => {
    if (!screenshotUrl) return;
    return () => URL.revokeObjectURL(screenshotUrl);
  }, [screenshotUrl]);

  useEffect(() => {
    if (!isScreenshotModalOpen) return;
    const handlePaste = (event: ClipboardEvent) => {
      const imageItem = Array.from(event.clipboardData?.items || []).find(item =>
        item.type.startsWith('image/')
      );
      const file = imageItem?.getAsFile();
      if (!file) return;
      event.preventDefault();
      recognitionRequest.current?.abort();
      setRecognizingScreenshot(false);
      setScreenshotFile(file);
      setScreenshotUrl(URL.createObjectURL(file));
      setScreenshotCards([]);
      setScreenshotError('');
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isScreenshotModalOpen]);

  useEffect(() => () => recognitionRequest.current?.abort(), []);

  useEffect(() => {
    if (!hasUniqueScreenshotCards) return;
    const request = new AbortController();
    checkDeckDuplicates(screenshotCards.map(card => card.id), request.signal)
      .then(names => {
        if (!request.signal.aborted) setDuplicateCheck({ cards: screenshotCards, names });
      })
      .catch(error => {
        if (request.signal.aborted) return;
        console.error(error);
        setDuplicateCheck({ cards: screenshotCards, names: null });
      });
    return () => request.abort();
  }, [screenshotCards, hasUniqueScreenshotCards, duplicateRetry]);

  const handleScreenshotFile = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setScreenshotError('Выберите файл изображения.');
      return;
    }
    if (file.size > 7 * 1024 * 1024) {
      setScreenshotError('Максимальный размер скриншота — 7 МБ.');
      return;
    }
    recognitionRequest.current?.abort();
    setRecognizingScreenshot(false);
    setScreenshotFile(file);
    setScreenshotUrl(URL.createObjectURL(file));
    setScreenshotCards([]);
    setScreenshotError('');
  };

  const handleScreenshotRecognition = async () => {
    if (!screenshotFile) {
      setScreenshotError('Сначала загрузите скриншот.');
      return;
    }
    recognitionRequest.current?.abort();
    const request = new AbortController();
    recognitionRequest.current = request;
    setScreenshotCards([]);
    setRecognizingScreenshot(true);
    setScreenshotError('');
    try {
      const recognized = await recognizeDeckScreenshot(screenshotFile, request.signal);
      if (!request.signal.aborted) setScreenshotCards(recognized);
    } catch (error) {
      if (request.signal.aborted) return;
      const message = isAxiosError<{ error?: string; details?: string }>(error)
        ? [error.response?.data.error, error.response?.data.details].filter(Boolean).join(' — ')
        : error instanceof Error
          ? error.message
          : 'Не удалось распознать скриншот.';
      setScreenshotError(message);
    } finally {
      if (!request.signal.aborted) setRecognizingScreenshot(false);
    }
  };

  const handleScreenshotCardChange = (index: number, cardId: string) => {
    const updatedCards = [...screenshotCards];
    const cardData = ALL_CARDS_DATA.find(card => card.id === cardId);
    updatedCards[index] = {
      id: cardId,
      name: cardData?.name || cardId,
      elixirCost: null,
      isEvolution: false,
      isChampion: Boolean(cardData?.champion),
      isHero: Boolean(cardData?.heroFile),
    };
    setScreenshotCards(updatedCards);
  };

  const closeScreenshotModal = () => {
    recognitionRequest.current?.abort();
    setRecognizingScreenshot(false);
    setIsScreenshotModalOpen(false);
    setScreenshotUrl(null);
    setScreenshotFile(null);
    setScreenshotCards([]);
    setScreenshotError('');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить колоду?')) return;
    await deleteMetaDeck(id);
    fetchDecks();
  };

  const handleImport = async () => {
    setImporting(true);
    setImportNotice(null);
    try {
      const res = await importMockDecks();
      const data = await res.json();
      if (!res.ok) {
        setImportNotice({ type: 'error', message: data.error || 'Не удалось импортировать мета-колоды.' });
        return;
      }
      setImportNotice({
        type: 'success',
        message: data.message || `Добавлено мета-колод: ${data.imported ?? 0}.`,
      });
      await Promise.all([fetchDecks(), fetchCategories()]);
    } catch (error) {
      console.error('Curated meta deck import failed:', error);
      setImportNotice({ type: 'error', message: 'Не удалось связаться с сервером для импорта мета-колод.' });
    } finally {
      setImporting(false);
    }
  };

  const handleApplyFilter = (include: string[], exclude: string[]) => {
    setIncludeCards(include);
    setExcludeCards(exclude);
    setIsFilterModalOpen(false);
  };

  const handleClearFilter = () => {
    setIncludeCards([]);
    setExcludeCards([]);
    setIsFilterModalOpen(false);
  };

  const hasActiveCardFilter = includeCards.length > 0 || excludeCards.length > 0;

  const catalog = useMemo(() => (decks ?? []).map(deck => {
    const cards = parseDeckCards(deck.cards);
    return { ...deck, cards, composition: deckComposition(cards) };
  }), [decks]);
  const savedCompositions = useMemo(
    () => new Set(savedDecks.map(deck => deckComposition(parseDeckCards(deck.cards)))),
    [savedDecks],
  );
  const sourceDeck = savingDeck && savedDecks.find(deck =>
    deckComposition(parseDeckCards(deck.cards)) === savingDeck.composition,
  );
  const targetSavedDeck = savingDeck && targetDecks.decks.find(deck =>
    deckComposition(parseDeckCards(deck.cards)) === savingDeck.composition,
  );
  const canSave = Boolean(targetPlayer && !targetSavedDeck && !saved.loading && !targetDecks.loading &&
    !saved.error && !targetDecks.error && !saveLoading);

  // Открыть модалку сохранения для выбранной колоды
  const openSaveModal = (deck: CatalogDeck) => {
    setSavingDeck(deck);
    setTargetPlayer(selectedPlayerName);
    setSaveError('');
    setSaveNotice('');
    setIsSaveModalOpen(true);
  };

  // Сохранить колоду
  const handleSaveDeck = async (mode: 'copy' | 'move') => {
    if (!savingDeck || !canSave || (mode === 'move' && !sourceDeck)) return;
    setSaveLoading(mode);
    setSaveError('');
    try {
      if (sourceDeck) {
        await transferSavedDeck(sourceDeck.id, selectedPlayerName, targetPlayer, mode);
      } else {
        await saveDeck(targetPlayer, savingDeck.name, savingDeck.cards);
      }
      saved.reload();
      setIsSaveModalOpen(false);
      setSavingDeck(null);
      setSaveNotice(mode === 'move' ? `Колода перенесена на «${targetPlayer}»` : `Колода сохранена на «${targetPlayer}»`);
    } catch (error) {
      setSaveError(isAxiosError<{ error?: string }>(error)
        ? error.response?.data.error || 'Не удалось сохранить колоду'
        : 'Не удалось сохранить колоду');
    } finally {
      setSaveLoading(null);
    }
  };

  const removeFromFavorites = async () => {
    if (!targetSavedDeck || !targetPlayer || saveLoading) return;
    setSaveLoading('remove');
    setSaveError('');
    try {
      await deleteSavedDeck(targetSavedDeck.id, targetPlayer);
      targetDecks.reload();
      setIsSaveModalOpen(false);
      setSavingDeck(null);
      setSaveNotice(`Колода убрана из избранного «${targetPlayer}»`);
    } catch (error) {
      setSaveError(isAxiosError<{ error?: string }>(error)
        ? error.response?.data.error || 'Не удалось убрать колоду из избранного'
        : 'Не удалось убрать колоду из избранного');
    } finally {
      setSaveLoading(null);
    }
  };

  const { sources, tiers } = useMemo(() => {
    const names = new Map<string, string>();
    const tiers = new Set<string>();
    for (const deck of catalog) {
      if (deck.source) names.set(deck.source.id, deck.source.name);
      if (deck.tier) tiers.add(deck.tier);
    }
    return {
      sources: [...names].sort((a, b) => a[1].localeCompare(b[1])),
      tiers: [...tiers].sort((a, b) => a.localeCompare(b)),
    };
  }, [catalog]);
  const nameQuery = search.trim().toLocaleLowerCase();
  const hasFilters = Boolean(nameQuery || filter !== 'all' || sourceFilter || tierFilter || favoritesOnly || hasActiveCardFilter);
  const checkingFavorites = favoritesOnly && saved.loading;
  const filteredDecks = useMemo(() => catalog.filter(deck =>
    deck.name.toLocaleLowerCase().includes(nameQuery) &&
    (filter === 'all' || deck.categoryId === filter) &&
    (!sourceFilter || deck.sourceId === sourceFilter) &&
    (!tierFilter || (tierFilter === 'untiered' ? !deck.tier : `tier:${deck.tier}` === tierFilter)) &&
    (!favoritesOnly || (deck.cards.length === 8 && savedCompositions.has(deck.composition))) &&
    includeCards.every(cardId => deck.cards.includes(cardId)) &&
    !excludeCards.some(cardId => deck.cards.includes(cardId))
  ), [catalog, nameQuery, filter, sourceFilter, tierFilter, favoritesOnly, savedCompositions, includeCards, excludeCards]);
  const filterControlClass = 'rounded border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700';

  const getCustomSrc = (cardId: string, slotIndex: number, slot2Type?: 'evo' | 'hero' | null) => {
    const card = cardsById.get(cardId);
    if (!card) return undefined;
    if (slotIndex === 0 && card.evoFile) return `/cards/Evo/${card.evoFile}.webp`;
    if (slotIndex === 1 && card.heroFile) return `/cards/Hero/${card.heroFile}.webp`;
    if (slotIndex === 2) {
      if (slot2Type === 'evo' && card.evoFile) return `/cards/Evo/${card.evoFile}.webp`;
      if (slot2Type === 'hero' && card.heroFile) return `/cards/Hero/${card.heroFile}.webp`;
      if (card.evoFile && !card.heroFile) return `/cards/Evo/${card.evoFile}.webp`;
      if (card.heroFile && !card.evoFile) return `/cards/Hero/${card.heroFile}.webp`;
    }
    return undefined;
  };

  const getSlotClass = (cardId: string, slotIndex: number, slot2Type?: 'evo' | 'hero' | null) => {
    const evolution = 'border-violet-500/60 bg-violet-500/10';
    const hero = 'border-amber-500/60 bg-amber-500/10';
    if (slotIndex === 0) return evolution;
    if (slotIndex === 1) return hero;
    if (slotIndex === 2) {
      if (slot2Type === 'evo') return evolution;
      if (slot2Type === 'hero') return hero;
      const card = cardsById.get(cardId);
      if (card?.evoFile) return evolution;
      if (card?.heroFile || card?.champion) return hero;
    }
    return 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40';
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className={`transition-colors duration-200 ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
      <div className="flex flex-wrap justify-between items-center mb-4 gap-2">
        <div>
          <h2 className="text-2xl font-bold">{latest ? 'Новые колоды' : 'Мета-колоды'}</h2>
          {decks && <p className="text-sm text-gray-600 dark:text-gray-400">Всего колод: {decks.length}</p>}
          {activePlayer && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span>Готовность и избранное для <strong>{selectedPlayerName}</strong></span>
              <Link className="text-blue-700 underline dark:text-blue-300" to={`/recommend?player=${encodeURIComponent(selectedPlayerName)}`}>Подобрать под аккаунт</Link>
              <Link className="text-blue-700 underline dark:text-blue-300" to={`/my-decks?player=${encodeURIComponent(selectedPlayerName)}`}>В мои колоды</Link>
            </div>
          )}
        </div>
        {canManageCatalog && (
        <div className="flex flex-wrap gap-2">
          <Link
            to="/decks/new"
            className={`flex items-center gap-1 px-4 py-2 rounded transition-all duration-200 hover:shadow-lg transform hover:scale-105 ${
              isDark ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-600 hover:bg-blue-700'
            } text-white`}
          >
            <PlusIcon className="w-4 h-4" />
            Добавить
          </Link>
          <button
            onClick={() => setIsScreenshotModalOpen(true)}
            className={`flex items-center gap-1 px-4 py-2 rounded transition-all duration-200 hover:shadow-lg ${
              isDark ? 'bg-violet-600 hover:bg-violet-700' : 'bg-violet-600 hover:bg-violet-700'
            } text-white`}
          >
            <PhotoIcon className="w-4 h-4" />
            Загрузить колоду по скриншоту
          </button>
          <button
            onClick={handleImport}
            disabled={importing}
            className={`flex items-center gap-1 px-4 py-2 rounded transition-all duration-200 ${
              importing
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:shadow-lg transform hover:scale-105'
            } ${isDark ? 'bg-green-600 hover:bg-green-700' : 'bg-green-600 hover:bg-green-700'} text-white`}
          >
            <ArrowPathIcon className={`w-4 h-4 ${importing ? 'animate-spin' : ''}`} />
            {importing ? 'Импорт...' : 'Импортировать Мета-колоды'}
          </button>
        </div>
        )}
      </div>

      {importNotice && (
        <div
          role={importNotice.type === 'error' ? 'alert' : 'status'}
          className={`mb-4 rounded-lg border p-3 ${
            importNotice.type === 'error'
              ? isDark ? 'border-red-800 bg-red-950/50 text-red-300' : 'border-red-200 bg-red-50 text-red-700'
              : isDark ? 'border-green-800 bg-green-950/50 text-green-300' : 'border-green-200 bg-green-50 text-green-700'
          }`}
        >
          {importNotice.message}
        </div>
      )}
      {saveNotice && <p role="status" className="mb-4 text-sm text-green-700 dark:text-green-400">{saveNotice}</p>}

      <div className={`mb-4 p-3 rounded-lg shadow flex flex-wrap items-center gap-3 transition-colors duration-200 ${
        isDark ? 'bg-gray-800' : 'bg-white'
      }`}>
        <input type="search" aria-label="Поиск колод по названию" placeholder="Поиск по названию…"
          value={search} onChange={event => setSearch(event.target.value)}
          className={`${filterControlClass} min-w-0 w-full sm:w-52`} />
        <select aria-label="Источник" value={sourceFilter} onChange={event => setSourceFilter(event.target.value)}
          className={filterControlClass}>
          <option value="">Все источники</option>
          {sources.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select aria-label="Тир" value={tierFilter} onChange={event => setTierFilter(event.target.value)}
          className={filterControlClass}>
          <option value="">Все тиры</option>
          {tiers.map(tier => <option key={tier} value={`tier:${tier}`}>{tier}</option>)}
          <option value="untiered">Без тира</option>
        </select>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={favoritesOnly} disabled={!selectedPlayerName}
            onChange={event => setFavoritesOnly(event.target.checked)} />
          Только избранное
        </label>
        <label htmlFor="deck-category" className={`font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
          Категория:
        </label>
        <select
          id="deck-category"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className={`rounded px-3 py-1 transition-colors duration-200 ${
            isDark
              ? 'bg-gray-700 border-gray-600 text-gray-200 focus:border-blue-400'
              : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
          } border focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
        >
          <option value="all">Все</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>

        <label htmlFor="deck-sort" className={`font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
          Сортировка:
        </label>
        <select
          id="deck-sort"
          value={`${sortBy}:${sortOrder}`}
          onChange={event => {
            const [nextSortBy, nextOrder] = event.target.value.split(':') as [MetaDeckSortBy, SortOrder];
            setSortBy(nextSortBy);
            setSortOrder(nextOrder);
          }}
          className={`rounded px-3 py-1 transition-colors duration-200 ${
            isDark
              ? 'bg-gray-700 border-gray-600 text-gray-200 focus:border-blue-400'
              : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
          } border focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
        >
          <option value="name:asc">По имени (А–Я / A–Z)</option>
          <option value="name:desc">По имени (Я–А / Z–A)</option>
          <option value="createdAt:desc">Сначала новые</option>
          <option value="createdAt:asc">Сначала старые</option>
          <option value="avgElixir:asc">Сначала дешёвые</option>
          <option value="avgElixir:desc">Сначала дорогие</option>
        </select>

        <button
          onClick={() => setIsFilterModalOpen(true)}
          className={`flex items-center gap-1 px-3 py-1 text-sm rounded transition-colors ${
            hasActiveCardFilter
              ? isDark
                ? 'bg-blue-600 text-white'
                : 'bg-blue-500 text-white'
              : isDark
              ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          <FunnelIcon className="w-4 h-4" />
          Фильтр по картам
          {hasActiveCardFilter && (
            <span className="ml-1 bg-white text-blue-600 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
              {includeCards.length + excludeCards.length}
            </span>
          )}
        </button>
        {decks && hasFilters && !checkingFavorites && !(favoritesOnly && saved.error) && (
          <span role="status" className="ml-auto text-sm text-gray-600 dark:text-gray-400">
            Показано {filteredDecks.length} из {decks.length}
          </span>
        )}
      </div>

      <AnimatePresence mode="wait">
        {checkingFavorites || (favoritesOnly && saved.error) ? (
          <p key="favorites-status" role={saved.error ? 'alert' : 'status'} className="py-8 text-center">
            {saved.error || 'Загрузка избранного…'}
          </p>
        ) : filteredDecks.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`text-center py-8 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}
          >
            {decks ? 'Нет колод, соответствующих фильтрам' : 'Не удалось загрузить мета-колоды'}
          </motion.div>
        ) : (
          <motion.div
            key="decks"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="grid grid-cols-1 gap-3 min-[600px]:grid-cols-2"
          >
            {filteredDecks.map((deck, deckIndex) => {
              const { cards } = deck;
              const missingCards = cards.filter(card => {
                const alias = card === 'Log' ? 'The Log' : card === 'The Log' ? 'Log' : card;
                return !((levels[card] ?? levels[alias]) > 0);
              }).length;
              const slot2TypeFromDeck = deck.slot2Type;
              const saved = cards.length === 8 && savedCompositions.has(deck.composition);
              return (
                <article
                  key={deck.id}
                  className="flex min-w-0 flex-col rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="min-w-0 break-words text-base font-semibold leading-snug text-gray-900 dark:text-gray-100">
                      {deck.name}
                    </h3>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => openSaveModal(deck)}
                        disabled={cards.length !== 8}
                        className={`p-1 rounded transition-colors ${
                          saved
                            ? isDark ? 'text-yellow-400 hover:bg-gray-600' : 'text-yellow-500 hover:bg-yellow-50'
                            : isDark ? 'text-gray-400 hover:bg-gray-600' : 'text-gray-400 hover:bg-gray-100'
                        }`}
                        aria-label={saved ? 'Управлять сохранённой колодой' : 'Сохранить в избранное'}
                        title={saved ? `Сохранено на «${selectedPlayerName}»`
                          : selectedPlayerName ? `Сохранить на «${selectedPlayerName}»` : 'Сохранить в избранное'}
                      >
                        <BookmarkIcon className={`w-5 h-5 ${saved ? 'fill-current' : ''}`} />
                      </button>
                      {canManageCatalog && <>
                      <Link
                        to={`/decks/edit/${deck.id}`}
                        className={`p-1 rounded transition-colors ${
                          isDark
                            ? 'text-blue-400 hover:bg-gray-600'
                            : 'text-blue-600 hover:bg-blue-50'
                        }`}
                        aria-label="Редактировать колоду"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => handleDelete(deck.id)}
                        className={`p-1 rounded transition-colors ${
                          isDark
                            ? 'text-red-400 hover:bg-gray-600'
                            : 'text-red-600 hover:bg-red-50'
                        }`}
                        aria-label="Удалить колоду"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                      </>}
                    </div>
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <TagIcon className="w-3 h-3" />
                      Категория: {deck.category?.name || '—'}
                    </span>
                    <span>Источник: {deck.source?.name || '—'}</span>
                    <span>{deck.dataKind ? metaDataLabels[deck.dataKind] : 'Тип данных не указан'}</span>
                    <span>Режим: {deck.gameMode || 'не указан'}</span>
                    {deck.dataDate ? (
                      <span>Дата данных: <time dateTime={deck.dataDate}>{deck.dataDate.split('-').reverse().join('.')}</time></span>
                    ) : (
                      <span>Добавлена: <time dateTime={deck.createdAt}>{new Date(deck.createdAt).toLocaleDateString('ru-RU')}</time></span>
                    )}
                    {deck.tier && (
                      <span className="flex items-center gap-1">
                        <TrophyIcon className="w-3 h-3" />
                        Тир: {deck.tier}
                      </span>
                    )}
                    {deck.addedByUsername && <span>Добавил: {deck.addedByUsername}</span>}
                    {deck.winRate != null && (
                      <span className="flex items-center gap-1">
                        <ChartBarIcon className="w-3 h-3" />
                        Винрейт: {deck.winRate}%
                      </span>
                    )}
                    {deck.sampleSize != null && <span>Матчей в выборке: {deck.sampleSize.toLocaleString('ru-RU')}</span>}
                    {typeof deck.avgElixir === 'number' && (
                      <span title="Средняя стоимость эликсира" className="rounded-full bg-blue-100 px-2 py-0.5 font-semibold text-blue-700 dark:bg-blue-900/50 dark:text-blue-200">
                        {deck.avgElixir.toFixed(1)} 💧
                      </span>
                    )}
                  </div>

                  {activePlayer && cards.length === 8 && (
                    <p className={`mt-2 text-xs font-medium ${missingCards
                      ? 'text-orange-700 dark:text-orange-300' : 'text-green-700 dark:text-green-300'}`}>
                      {missingCards ? `Не хватает карт: ${missingCards} из 8` : 'Все карты доступны'}
                    </p>
                  )}
                  <div className="mt-auto pt-3">
                    <div className="mx-auto grid w-full max-w-[19rem] grid-cols-4 gap-1.5 lg:max-w-none lg:grid-cols-8">
                      {cards.map((card, index) => (
                        <div key={index} className={`aspect-[3/4] min-w-0 rounded-md border p-0.5 ${getSlotClass(card, index, slot2TypeFromDeck)}`}>
                          <CardIcon
                            cardId={card}
                            className="block h-full w-full"
                            customSrc={getCustomSrc(card, index, slot2TypeFromDeck)}
                            loading={deckIndex < 3 ? 'eager' : 'lazy'}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </article>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Модалка фильтра по картам */}
      <DeckFilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        onApply={handleApplyFilter}
        onClear={handleClearFilter}
        initialInclude={includeCards}
        initialExclude={excludeCards}
        isDark={isDark}
      />

      <Dialog.Root open={isScreenshotModalOpen} onOpenChange={open => open ? setIsScreenshotModalOpen(true) : closeScreenshotModal()}>
        <AnimatePresence>
          {isScreenshotModalOpen && (
            <Dialog.Portal forceMount>
              <Dialog.Overlay asChild>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                />
              </Dialog.Overlay>
              <Dialog.Content className="fixed inset-0 flex items-center justify-center z-50 p-4">
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 12 }}
                  className={`relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl p-6 shadow-xl ${
                    isDark ? 'bg-gray-800 text-gray-100' : 'bg-white text-gray-900'
                  }`}
                  onDragOver={event => event.preventDefault()}
                  onDrop={event => {
                    event.preventDefault();
                    handleScreenshotFile(event.dataTransfer.files[0]);
                  }}
                >
                  <button
                    onClick={closeScreenshotModal}
                    className="absolute right-4 top-4 rounded p-1 hover:bg-gray-500/20"
                    aria-label="Закрыть"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                  <Dialog.Title className="mb-2 text-xl font-bold">Распознать колоду по скриншоту</Dialog.Title>
                  <p className={`mb-4 text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                    Выберите или перетащите изображение с сеткой карт 2×4. Можно вставить картинку из буфера через Ctrl+V.
                    Распознавание выполняется локально; проверьте предложенные карты перед продолжением.
                  </p>

                  <input
                    ref={screenshotInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={event => handleScreenshotFile(event.target.files?.[0])}
                  />
                  <div className="mb-4 flex flex-wrap gap-2">
                    <button
                      onClick={() => screenshotInputRef.current?.click()}
                      className="flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                    >
                      <ArrowUpTrayIcon className="h-4 w-4" />
                      Выбрать изображение
                    </button>
                    <button
                      onClick={handleScreenshotRecognition}
                      disabled={!screenshotUrl || recognizingScreenshot}
                      className={`rounded px-4 py-2 text-white ${
                        !screenshotUrl || recognizingScreenshot
                          ? 'cursor-not-allowed bg-indigo-400 opacity-60'
                          : 'bg-indigo-600 hover:bg-indigo-700'
                      }`}
                    >
                      {recognizingScreenshot ? 'Распознавание...' : 'Распознать 8 карт'}
                    </button>
                  </div>

                  {screenshotUrl && (
                    <img
                      src={screenshotUrl}
                      alt="Загруженный скриншот колоды"
                      className="mb-4 max-h-64 max-w-full rounded-lg border border-gray-500 object-contain"
                    />
                  )}
                  {screenshotError && (
                    <div role="alert" className="mb-4 rounded border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                      {screenshotError}
                    </div>
                  )}
                  {checkingScreenshotDuplicates && (
                    <p className="mb-3 text-sm">Проверяю мета-колоды и сохранённые колоды аккаунтов…</p>
                  )}
                  {currentDuplicateCheck?.names === null && (
                    <div role="alert" className="mb-4 text-sm">
                      Не удалось проверить дубликаты.{' '}
                      <button type="button" className="underline" onClick={() => {
                        setDuplicateCheck(null);
                        setDuplicateRetry(attempt => attempt + 1);
                      }}>Повторить проверку</button>
                    </div>
                  )}
                  {screenshotDuplicates.length > 0 && (
                    <div role="status" className="mb-4 rounded border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
                      {screenshotDuplicates.map(name => (
                        <div key={name}>Такая колода уже есть в системе: <strong>{name}</strong></div>
                      ))}
                    </div>
                  )}
                  {screenshotCards.length > 0 && (
                    <>
                      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {screenshotCards.map((recognizedCard, index) => (
                          <label
                            key={index}
                            className={`flex min-w-0 flex-col items-center gap-2 rounded-lg border p-3 ${
                              isDark ? 'border-gray-600 bg-gray-700' : 'border-gray-200 bg-gray-50'
                            }`}
                          >
                            <CardIcon
                              cardId={recognizedCard.id}
                              className="h-16 w-16"
                              customSrc={
                                recognizedCard.isEvolution
                                  ? `/cards/Evo/${ALL_CARDS_DATA.find(card => card.id === recognizedCard.id)?.evoFile}.webp`
                                  : undefined
                              }
                            />
                            <span className="text-xs">Слот {index + 1}</span>
                            <span className="text-center text-sm font-medium">{recognizedCard.name}</span>
                            <span className="text-xs text-violet-500">
                              {recognizedCard.isEvolution ? 'Эволюция' : recognizedCard.isChampion ? 'Чемпион' : ''}
                            </span>
                            <select
                              value={recognizedCard.id}
                              onChange={event => handleScreenshotCardChange(index, event.target.value)}
                              className={`w-full rounded border px-2 py-1 text-xs ${
                                isDark ? 'border-gray-500 bg-gray-800 text-gray-100' : 'border-gray-300 bg-white'
                              }`}
                            >
                              {ALL_CARDS_DATA.map(card => (
                                <option key={card.id} value={card.id}>{card.name}</option>
                              ))}
                            </select>
                          </label>
                        ))}
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          onClick={closeScreenshotModal}
                          className={`rounded px-4 py-2 ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'}`}
                        >
                          Отмена
                        </button>
                        <button
                          onClick={() => {
                            const featuredCards = screenshotCards.filter(
                              card => card.isChampion || card.isEvolution
                            );
                            const titleCards = featuredCards.length > 0
                              ? featuredCards
                              : [...screenshotCards]
                                  .sort((left, right) => (right.elixirCost ?? 0) - (left.elixirCost ?? 0))
                                  .slice(0, 3);
                            const generatedName = titleCards.map(card => {
                              const cardData = ALL_CARDS_DATA.find(item => item.id === card.id);
                              if (!cardData) return card.id.replace(/[^a-zA-Z0-9]/g, '');
                              if (card.isEvolution) return `Evo${cardData.evoFile || cardData.file}`;
                              return cardData.file;
                            }).join(' ');
                            navigate('/decks/new', {
                              state: {
                                prefillCards: screenshotCards.map(card => card.id),
                                prefillSlot2Type: screenshotCards[2]?.isEvolution ? 'evo' : undefined,
                                prefillName: generatedName,
                                prefillCategoryName: 'general',
                                prefillSourceName: 'PrtScn',
                              },
                            });
                            closeScreenshotModal();
                          }}
                          disabled={!canContinueScreenshot}
                          className={`rounded px-4 py-2 text-white ${
                            !canContinueScreenshot
                              ? 'cursor-not-allowed bg-green-400 opacity-60'
                              : 'bg-green-600 hover:bg-green-700'
                          }`}
                        >
                          Продолжить в форму создания
                        </button>
                      </div>
                    </>
                  )}
                </motion.div>
              </Dialog.Content>
            </Dialog.Portal>
          )}
        </AnimatePresence>
      </Dialog.Root>

      {/* Модалка сохранения колоды */}
      <Dialog.Root open={isSaveModalOpen} onOpenChange={open => {
        if (!saveLoading) setIsSaveModalOpen(open);
      }}>
        <AnimatePresence>
          {isSaveModalOpen && savingDeck && (
            <Dialog.Portal forceMount>
              <Dialog.Overlay asChild>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
                />
              </Dialog.Overlay>
              <Dialog.Content className="fixed inset-0 flex items-center justify-center z-50 p-4">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 20 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  className={`max-w-md w-full rounded-lg shadow-xl p-6 ${
                    isDark ? 'bg-gray-800 text-gray-200' : 'bg-white text-gray-900'
                  }`}
                >
                  <Dialog.Close asChild>
                    <button
                      disabled={Boolean(saveLoading)}
                      className={`absolute top-2 right-2 p-1 rounded-full transition-colors ${
                        isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-600'
                      }`}
                      aria-label="Закрыть"
                    >
                      <XMarkIcon className="w-5 h-5" />
                    </button>
                  </Dialog.Close>
                  <Dialog.Title className="text-lg font-bold mb-4">
                    {sourceDeck ? 'Сохранённая колода' : 'Сохранить колоду в избранное'}
                  </Dialog.Title>
                  <div className="mb-4 space-y-3">
                    <Dialog.Description className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                      Колода: <strong>{savingDeck.name}</strong>
                      {sourceDeck && <>. Сохранена на «{selectedPlayerName}».</>}
                    </Dialog.Description>
                    <fieldset disabled={Boolean(saveLoading)}>
                      {players.length === 1 && <p>Аккаунт <strong>{targetPlayer}</strong></p>}
                      <ProfileSwitcher profiles={players} value={targetPlayer} onChange={name => {
                        setTargetPlayer(name);
                        setSaveError('');
                      }} />
                    </fieldset>
                    {targetDecks.loading && <p role="status" className="text-sm">Проверяем избранное…</p>}
                    {targetSavedDeck && <p role="status" className="text-sm">На «{targetPlayer}» уже есть эта колода.</p>}
                    {sourceDeck && canSave && <p className="text-sm">Копия останется на обоих аккаунтах. При переносе колода исчезнет из избранного «{selectedPlayerName}».</p>}
                  </div>
                  {(saveError || saved.error || targetDecks.error) && (
                    <div role="alert" className={`mb-3 p-2 rounded text-sm ${isDark ? 'bg-red-900/50 text-red-300' : 'bg-red-100 text-red-600'}`}>
                      {saveError || saved.error || targetDecks.error}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 justify-end">
                    <button
                      onClick={() => setIsSaveModalOpen(false)}
                      disabled={Boolean(saveLoading)}
                      className={`px-4 py-2 rounded transition-colors ${
                        isDark ? 'bg-gray-600 hover:bg-gray-500 text-gray-200' : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
                      }`}
                    >
                      Отмена
                    </button>
                    {targetSavedDeck && (
                      <button type="button" onClick={() => void removeFromFavorites()} disabled={Boolean(saveLoading)}
                        className="inline-flex items-center gap-2 rounded border border-red-500 px-3 py-2 text-red-700 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/30">
                        <TrashIcon className="h-4 w-4" aria-hidden="true" />
                        {saveLoading === 'remove' ? 'Удаление…' : 'Убрать из избранного'}
                      </button>
                    )}
                    {!targetSavedDeck && sourceDeck && players.length > 1 && (
                      <button type="button" onClick={() => void handleSaveDeck('move')} disabled={!canSave}
                        className="rounded border border-blue-600 px-3 py-2 text-blue-700 hover:bg-blue-50 disabled:opacity-50 dark:text-blue-300 dark:hover:bg-gray-700">
                        {saveLoading === 'move' ? 'Перенос…' : 'Перенести'}
                      </button>
                    )}
                    {!targetSavedDeck && (!sourceDeck || players.length > 1) && (
                      <button type="button" onClick={() => void handleSaveDeck('copy')} disabled={!canSave}
                        className="rounded bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-50">
                        {saveLoading === 'copy' ? 'Сохранение…' : sourceDeck ? 'Сохранить копию' : 'Сохранить'}
                      </button>
                    )}
                  </div>
                </motion.div>
              </Dialog.Content>
            </Dialog.Portal>
          )}
        </AnimatePresence>
      </Dialog.Root>
    </div>
  );
};

export default DeckList;
