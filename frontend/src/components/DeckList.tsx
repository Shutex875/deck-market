import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import * as Dialog from '@radix-ui/react-dialog';
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
import { getMetaDecks, deleteMetaDeck, getCategories, Category, getPlayers, getSavedDecks, saveDeck, SavedDeck, Player, recognizeDeckScreenshot, RecognizedDeckCard, MetaDeckSortBy, SortOrder } from '../api';
import { CardIcon } from '../utils/cardImages';
import { ALL_CARDS_DATA } from '../data/cards';
import { useTheme } from '../context/ThemeContext';
import DeckFilterModal from './DeckFilterModal';

const DeckList: React.FC = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const navigate = useNavigate();
  const screenshotInputRef = useRef<HTMLInputElement>(null);

  const [decks, setDecks] = useState<any[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState<MetaDeckSortBy>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importNotice, setImportNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isScreenshotModalOpen, setIsScreenshotModalOpen] = useState(false);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotCards, setScreenshotCards] = useState<RecognizedDeckCard[]>([]);
  const [screenshotError, setScreenshotError] = useState('');
  const [screenshotDuplicates, setScreenshotDuplicates] = useState<string[]>([]);
  const [screenshotSavedDecks, setScreenshotSavedDecks] = useState<SavedDeck[]>([]);
  const [recognizingScreenshot, setRecognizingScreenshot] = useState(false);
  const [checkingScreenshotDuplicates, setCheckingScreenshotDuplicates] = useState(false);

  // Фильтр по картам
  const [includeCards, setIncludeCards] = useState<string[]>([]);
  const [excludeCards, setExcludeCards] = useState<string[]>([]);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  // Состояния для сохранения в избранное
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayerName, setSelectedPlayerName] = useState<string>('');
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>([]);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [savingDeck, setSavingDeck] = useState<any | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState('');

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

  const fetchPlayers = async () => {
    try {
      const data = await getPlayers();
      setPlayers(data);
      if (data.length > 0) {
        setSelectedPlayerName(data[0].name);
        await loadSavedDecks(data[0].name);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const loadSavedDecks = async (playerName: string) => {
    try {
      const data = await getSavedDecks(playerName);
      setSavedDecks(data);
    } catch (error) {
      console.error('Ошибка загрузки сохранённых колод', error);
    }
  };

  useEffect(() => {
    fetchCategories();
    fetchPlayers();
  }, []);

  useEffect(() => {
    fetchDecks();
  }, [sortBy, sortOrder]);

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
      setScreenshotFile(file);
      setScreenshotUrl(URL.createObjectURL(file));
      setScreenshotCards([]);
      setScreenshotDuplicates([]);
      setScreenshotError('');
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isScreenshotModalOpen]);

  const parseDeckCards = (cardsJson: string): string[] => {
    try {
      const cards: unknown = JSON.parse(cardsJson);
      return Array.isArray(cards) && cards.every(card => typeof card === 'string') ? cards : [];
    } catch {
      return [];
    }
  };

  const findScreenshotDuplicates = (cards: string[], saved: SavedDeck[]) => {
    const composition = [...cards].sort().join('|');
    const matchingNames = new Set<string>();

    decks.forEach(deck => {
      const existingCards = parseDeckCards(deck.cards);
      if (existingCards.length === 8 && [...existingCards].sort().join('|') === composition) {
        matchingNames.add(deck.name);
      }
    });
    saved.forEach(deck => {
      const existingCards = parseDeckCards(deck.cards);
      if (existingCards.length === 8 && [...existingCards].sort().join('|') === composition) {
        matchingNames.add(deck.name);
      }
    });
    return [...matchingNames];
  };

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
    setScreenshotFile(file);
    setScreenshotUrl(URL.createObjectURL(file));
    setScreenshotCards([]);
    setScreenshotDuplicates([]);
    setScreenshotError('');
  };

  const handleScreenshotRecognition = async () => {
    if (!screenshotFile) {
      setScreenshotError('Сначала загрузите скриншот.');
      return;
    }
    setRecognizingScreenshot(true);
    setScreenshotError('');
    try {
      const recognized = await recognizeDeckScreenshot(screenshotFile);
      setScreenshotCards(recognized);
      setCheckingScreenshotDuplicates(true);
      const savedDeckResults = await Promise.allSettled(
        players.map(player => getSavedDecks(player.name))
      );
      const allSavedDecks = savedDeckResults.flatMap(result =>
        result.status === 'fulfilled' ? result.value : []
      );
      setScreenshotSavedDecks(allSavedDecks);
      setScreenshotDuplicates(findScreenshotDuplicates(recognized.map(card => card.id), allSavedDecks));
      if (savedDeckResults.some(result => result.status === 'rejected')) {
        setScreenshotError('Не удалось проверить сохранённые колоды всех аккаунтов; проверка мета-колод выполнена.');
      }
    } catch (error) {
      const message = isAxiosError<{ error?: string; details?: string }>(error)
        ? [error.response?.data.error, error.response?.data.details].filter(Boolean).join(' — ')
        : error instanceof Error
          ? error.message
          : 'Не удалось распознать скриншот.';
      setScreenshotError(message);
    } finally {
      setRecognizingScreenshot(false);
      setCheckingScreenshotDuplicates(false);
    }
  };

  const handleScreenshotCardChange = (index: number, cardId: string) => {
    const updatedCards = [...screenshotCards];
    const cardData = ALL_CARDS_DATA.find(card => card.id === cardId);
    updatedCards[index] = {
      id: cardId,
      name: cardData?.name || cardId,
      isEvolution: false,
      isChampion: Boolean(cardData?.champion),
      isHero: Boolean(cardData?.heroFile),
    };
    setScreenshotCards(updatedCards);
    setScreenshotDuplicates(findScreenshotDuplicates(updatedCards.map(card => card.id), screenshotSavedDecks));
  };

  const closeScreenshotModal = () => {
    setIsScreenshotModalOpen(false);
    setScreenshotUrl(null);
    setScreenshotFile(null);
    setScreenshotCards([]);
    setScreenshotError('');
    setScreenshotDuplicates([]);
    setScreenshotSavedDecks([]);
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
      const res = await fetch('/api/meta-decks/import-mock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setImportNotice({ type: 'error', message: data.error || 'Не удалось импортировать мета-колоды.' });
        return;
      }
      setImportNotice({
        type: 'success',
        message: data.message || `Добавлено мета-колод: ${data.imported ?? 0}.`,
      });
      await fetchDecks();
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

  // Проверка, сохранена ли колода для выбранного игрока
  const isDeckSaved = (cards: string[]): boolean => {
    const sortedCards = [...cards].sort();
    for (const saved of savedDecks) {
      const savedCards = JSON.parse(saved.cards) as string[];
      const sortedSaved = [...savedCards].sort();
      if (sortedCards.length === sortedSaved.length && sortedCards.every((c, i) => c === sortedSaved[i])) {
        return true;
      }
    }
    return false;
  };

  // Открыть модалку сохранения для выбранной колоды
  const openSaveModal = (deck: any) => {
    setSavingDeck(deck);
    setSaveError('');
    setIsSaveModalOpen(true);
  };

  // Сохранить колоду
  const handleSaveDeck = async () => {
    if (!savingDeck || !selectedPlayerName) return;
    setSaveLoading(true);
    setSaveError('');
    try {
      const cards = JSON.parse(savingDeck.cards);
      // Проверяем, не сохранена ли уже
      const isAlreadySaved = isDeckSaved(cards);
      if (isAlreadySaved) {
        setSaveError('Эта колода уже сохранена для выбранного аккаунта');
        setSaveLoading(false);
        return;
      }
      await saveDeck(selectedPlayerName, savingDeck.name, cards);
      // Обновляем список сохранённых колод для выбранного игрока
      await loadSavedDecks(selectedPlayerName);
      setIsSaveModalOpen(false);
      setSavingDeck(null);
      alert('Колода сохранена!');
    } catch (error) {
      setSaveError('Ошибка сохранения колоды');
    } finally {
      setSaveLoading(false);
    }
  };

  // Фильтрация
  const filteredDecks = decks.filter(deck => {
    if (filter !== 'all' && deck.categoryId !== filter) return false;
    if (includeCards.length > 0 || excludeCards.length > 0) {
      const deckCards = JSON.parse(deck.cards) as string[];
      const hasAllInclude = includeCards.every(cardId => deckCards.includes(cardId));
      if (!hasAllInclude) return false;
      const hasAnyExclude = excludeCards.some(cardId => deckCards.includes(cardId));
      if (hasAnyExclude) return false;
    }
    return true;
  });

  const getCustomSrc = (cardId: string, slotIndex: number, slot2Type?: 'evo' | 'hero' | null) => {
    const card = ALL_CARDS_DATA.find(c => c.id === cardId);
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

  const getSlotBorderClass = (slotIndex: number, slot2Type?: 'evo' | 'hero' | null, cardId?: string) => {
    if (slotIndex === 0) return 'border-purple-500 border-4';
    if (slotIndex === 1) return 'border-yellow-500 border-4';
    if (slotIndex === 2) {
      if (slot2Type === 'evo') return 'border-purple-500 border-4';
      if (slot2Type === 'hero') return 'border-yellow-500 border-4';
      const card = cardId ? ALL_CARDS_DATA.find(c => c.id === cardId) : null;
      if (card?.evoFile) return 'border-purple-500 border-4';
      if (card?.heroFile || card?.champion) return 'border-yellow-500 border-4';
      return 'border-gray-300 border-2 animate-borderGlow';
    }
    return 'border-gray-300 border-2';
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
        <h2 className="text-2xl font-bold">Мета-колоды</h2>
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

      <div className={`mb-4 p-3 rounded-lg shadow flex flex-wrap items-center gap-3 transition-colors duration-200 ${
        isDark ? 'bg-gray-800' : 'bg-white'
      }`}>
        <FunnelIcon className={`w-4 h-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
        <label className={`font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
          Категория:
        </label>
        <select
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
      </div>

      <AnimatePresence mode="wait">
        {filteredDecks.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`text-center py-8 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}
          >
            Нет колод, соответствующих фильтрам
          </motion.div>
        ) : (
          <motion.div
            key="decks"
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={{
              hidden: { opacity: 0 },
              visible: {
                opacity: 1,
                transition: {
                  staggerChildren: 0.05,
                },
              },
            }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {filteredDecks.map(deck => {
              const cards = JSON.parse(deck.cards);
              const slot2TypeFromDeck = deck.slot2Type;
              const saved = isDeckSaved(cards);
              return (
                <motion.div
                  key={deck.id}
                  variants={{
                    hidden: { opacity: 0, y: 20, scale: 0.95 },
                    visible: { opacity: 1, y: 0, scale: 1 },
                  }}
                  whileHover={{ scale: 1.02, boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  className={`rounded-lg shadow p-4 border-l-4 border-blue-500 transition-colors duration-200 ${
                    isDark ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <h3 className={`font-bold text-lg truncate ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                      {deck.name}
                    </h3>
                    <div className="flex gap-1 items-center">
                      <button
                        onClick={() => openSaveModal(deck)}
                        className={`p-1 rounded transition-colors ${
                          saved
                            ? isDark ? 'text-yellow-400 hover:bg-gray-600' : 'text-yellow-500 hover:bg-yellow-50'
                            : isDark ? 'text-gray-400 hover:bg-gray-600' : 'text-gray-400 hover:bg-gray-100'
                        }`}
                        aria-label={saved ? 'Уже сохранено' : 'Сохранить в избранное'}
                        title={saved ? 'Уже сохранено для выбранного аккаунта' : 'Сохранить в избранное'}
                      >
                        <BookmarkIcon className={`w-5 h-5 ${saved ? 'fill-current' : ''}`} />
                      </button>
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
                    </div>
                  </div>

                  <div className={`text-sm mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 ${
                    isDark ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    <span className="flex items-center gap-1">
                      <TagIcon className="w-3 h-3" />
                      Категория: {deck.category?.name || '—'}
                    </span>
                    <span>Источник: {deck.source?.name || '—'}</span>
                    {deck.tier && (
                      <span className="flex items-center gap-1">
                        <TrophyIcon className="w-3 h-3" />
                        Тир: {deck.tier}
                      </span>
                    )}
                    {deck.winRate && (
                      <span className="flex items-center gap-1">
                        <ChartBarIcon className="w-3 h-3" />
                        Винрейт: {deck.winRate}%
                      </span>
                    )}
                    {typeof deck.avgElixir === 'number' && (
                      <span title="Средняя стоимость эликсира" className="rounded-full bg-blue-100 px-2 py-0.5 font-semibold text-blue-700 dark:bg-blue-900/50 dark:text-blue-200">
                        {deck.avgElixir.toFixed(1)} 💧
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-4 gap-1 mt-2">
                    {cards.map((card: string, idx: number) => {
                      const customSrc = getCustomSrc(card, idx, slot2TypeFromDeck);
                      const borderClass = getSlotBorderClass(idx, slot2TypeFromDeck, card);
                      return (
                        <div key={idx} className={`relative rounded bg-gray-50 dark:bg-gray-700 p-1 flex flex-col items-center ${borderClass}`}>
                          <CardIcon cardId={card} className="w-10 h-10" customSrc={customSrc} />
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
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
                            const generatedWinRate = (
                              Math.random() * (55.8 - 51.5) + 51.5
                            ).toFixed(1);
                            navigate('/decks/new', {
                              state: {
                                prefillCards: screenshotCards.map(card => card.id),
                                prefillSlot2Type: screenshotCards[2]?.isEvolution ? 'evo' : undefined,
                                prefillName: generatedName,
                                prefillTier: 'A',
                                prefillWinRate: generatedWinRate,
                                prefillCategoryName: 'general',
                                prefillSourceName: 'PrtScn',
                              },
                            });
                            closeScreenshotModal();
                          }}
                          disabled={new Set(screenshotCards.map(card => card.id)).size !== 8 || screenshotDuplicates.length > 0}
                          className={`rounded px-4 py-2 text-white ${
                            new Set(screenshotCards.map(card => card.id)).size !== 8 || screenshotDuplicates.length > 0
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
      <Dialog.Root open={isSaveModalOpen} onOpenChange={setIsSaveModalOpen}>
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
                      className={`absolute top-2 right-2 p-1 rounded-full transition-colors ${
                        isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-600'
                      }`}
                      aria-label="Закрыть"
                    >
                      <XMarkIcon className="w-5 h-5" />
                    </button>
                  </Dialog.Close>
                  <Dialog.Title className="text-lg font-bold mb-4">
                    Сохранить колоду в избранное
                  </Dialog.Title>
                  <div className="mb-4">
                    <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                      Колода: <strong>{savingDeck.name}</strong>
                    </p>
                    <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                      Выберите аккаунт для сохранения:
                    </p>
                    <select
                      value={selectedPlayerName}
                      onChange={(e) => {
                        setSelectedPlayerName(e.target.value);
                        loadSavedDecks(e.target.value);
                        setSaveError('');
                      }}
                      className={`w-full mt-2 rounded px-3 py-2 transition-colors duration-200 ${
                        isDark
                          ? 'bg-gray-700 border-gray-600 text-gray-200 focus:border-blue-400'
                          : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
                      } border focus:outline-none`}
                    >
                      {players.map(p => (
                        <option key={p.id} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  {saveError && (
                    <div className={`mb-3 p-2 rounded text-sm ${isDark ? 'bg-red-900/50 text-red-300' : 'bg-red-100 text-red-600'}`}>
                      {saveError}
                    </div>
                  )}
                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => setIsSaveModalOpen(false)}
                      className={`px-4 py-2 rounded transition-colors ${
                        isDark ? 'bg-gray-600 hover:bg-gray-500 text-gray-200' : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
                      }`}
                    >
                      Отмена
                    </button>
                    <button
                      onClick={handleSaveDeck}
                      disabled={saveLoading}
                      className={`px-4 py-2 rounded transition-all ${
                        saveLoading ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-lg transform hover:scale-105'
                      } ${isDark ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
                    >
                      {saveLoading ? 'Сохранение...' : 'Сохранить'}
                    </button>
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
