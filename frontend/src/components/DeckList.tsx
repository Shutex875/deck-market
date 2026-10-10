import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
} from '@heroicons/react/24/outline';
import { getMetaDecks, deleteMetaDeck, getCategories, Category, getPlayers, getSavedDecks, saveDeck, SavedDeck, Player } from '../api';
import { CardIcon } from '../utils/cardImages';
import { ALL_CARDS_DATA } from '../data/cards';
import { useTheme } from '../context/ThemeContext';
import DeckFilterModal from './DeckFilterModal';

const DeckList: React.FC = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [decks, setDecks] = useState<any[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

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
      const data = await getMetaDecks();
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
    fetchDecks();
    fetchCategories();
    fetchPlayers();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить колоду?')) return;
    await deleteMetaDeck(id);
    fetchDecks();
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await fetch('/api/meta-decks/import-mock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`Ошибка: ${data.error}`);
        return;
      }
      alert(data.message || `Импортировано ${data.imported} колод`);
      fetchDecks();
    } catch (error) {
      alert('Ошибка соединения с сервером');
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
            onClick={handleImport}
            disabled={importing}
            className={`flex items-center gap-1 px-4 py-2 rounded transition-all duration-200 ${
              importing
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:shadow-lg transform hover:scale-105'
            } ${isDark ? 'bg-green-600 hover:bg-green-700' : 'bg-green-600 hover:bg-green-700'} text-white`}
          >
            <ArrowPathIcon className={`w-4 h-4 ${importing ? 'animate-spin' : ''}`} />
            {importing ? 'Импорт...' : 'Импорт мок-колод'}
          </button>
        </div>
      </div>

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
