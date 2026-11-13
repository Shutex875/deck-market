import ProfileSwitcher from './ProfileSwitcher';
import { useSavedDecks } from '../hooks/useSavedDecks';
import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import * as Dialog from '@radix-ui/react-dialog';
import {
  XMarkIcon,
  MagnifyingGlassIcon,
  ChartBarIcon,
  ArrowPathIcon,
  BookmarkIcon,
  TrashIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import {
  getPlayers,
  recommendDecks,
  Player,
  saveDeck,
  deleteSavedDeck,
  type RecommendResponse,
} from '../api';
import { CardIcon } from '../utils/cardImages';
import { ALL_CARDS_DATA } from '../data/cards';
import { useTheme } from '../context/ThemeContext';
import RecommendFilterModal from './RecommendFilterModal';

type RecommendedDeck = RecommendResponse['decks'][number];
type SlotStatus = NonNullable<RecommendedDeck['slotStatus']>[number];

// Безопасное преобразование в строку
const safeString = (value: any): string => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    if (value.name !== undefined && typeof value.name === 'string') return value.name;
    if (value.id && value.name) return String(value.name);
    return '[объект]';
  }
  return String(value);
};

const Recommend: React.FC = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [searchParams] = useSearchParams();
  const requestedPlayer = searchParams.get('player');

  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState('');
  const [limit, setLimit] = useState(1); // по умолчанию 1
  const [decks, setDecks] = useState<RecommendedDeck[]>([]);
  const [totalDecks, setTotalDecks] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const recommendRequest = useRef<AbortController | null>(null);

  const [error, setError] = useState('');
  const { decks: savedDecks, reload: reloadSavedDecks } = useSavedDecks(selectedPlayer);

  const [includeCards, setIncludeCards] = useState<string[]>([]);
  const [excludeCards, setExcludeCards] = useState<string[]>([]);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveDeckName, setSaveDeckName] = useState('');
  const [saveDeckData, setSaveDeckData] = useState<{ cards: string[]; name: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => () => recommendRequest.current?.abort(), []);

  useEffect(() => {
    const fetchPlayers = async () => {
      try {
        const data = await getPlayers();
        setPlayers(data);
        if (data.length > 0) {
          const initialPlayer = data.find(player => player.name === requestedPlayer) || data[0];
          setSelectedPlayer(initialPlayer.name);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchPlayers();
  }, []);

  const hasActiveFilter = includeCards.length > 0 || excludeCards.length > 0;

  const handleRecommend = async (include = includeCards, exclude = excludeCards, count = limit) => {
    if (!selectedPlayer) {
      setError('Выберите аккаунт');
      return;
    }
    recommendRequest.current?.abort();
    const request = new AbortController();
    recommendRequest.current = request;
    setLoading(true);
    setError('');
    setDecks([]);
    setTotalDecks(null);
    try {
      const result = await recommendDecks(selectedPlayer, count, include, exclude, request.signal);
      if (request.signal.aborted) return;
      setDecks(result.decks);
      setTotalDecks(result.totalDecks);
    } catch (err) {
      if (request.signal.aborted) return;
      setError('Ошибка получения данных');
      console.error(err);
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  };

  const handleApplyFilter = (include: string[], exclude: string[]) => {
    setIncludeCards(include);
    setExcludeCards(exclude);
    setIsFilterModalOpen(false);
    if (recommendRequest.current) void handleRecommend(include, exclude);
  };

  const handleClearFilter = () => handleApplyFilter([], []);

  const handlePlayerChange = (playerName: string) => {
    recommendRequest.current?.abort();
    recommendRequest.current = null;
    setSelectedPlayer(playerName);
    setShowSaveModal(false);
    setDecks([]);
    setTotalDecks(null);
    setLoading(false);
    setError('');
  };

  const handleSaveDeck = (deck: RecommendedDeck) => {
    setSaveDeckData({ cards: deck.cards, name: deck.name });
    setSaveDeckName(deck.name);
    setShowSaveModal(true);
  };

  const confirmSave = async () => {
    if (!saveDeckData || !saveDeckName.trim()) return;
    setSaving(true);
    try {
      await saveDeck(selectedPlayer, saveDeckName.trim(), saveDeckData.cards);
      alert('Колода сохранена!');
      setShowSaveModal(false);
      reloadSavedDecks();
    } catch (err) {
      alert('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSavedDeck = async (deckId: string) => {
    if (!confirm('Удалить сохранённую колоду?')) return;
    try {
      await deleteSavedDeck(deckId, selectedPlayer);
      reloadSavedDecks();
    } catch (err) {
      alert('Ошибка удаления');
    }
  };

  const isDeckSaved = (cards: string[]): string | null => {
    const sortedCards = [...cards].sort();
    for (const saved of savedDecks) {
      const savedCards = JSON.parse(saved.cards) as string[];
      const sortedSaved = [...savedCards].sort();
      if (sortedCards.length === sortedSaved.length && sortedCards.every((c, i) => c === sortedSaved[i])) {
        return saved.id;
      }
    }
    return null;
  };

  const getSlotBorderClass = (slotIndex: number, slot2Type?: 'evo' | 'hero' | null, cardId?: string) => {
    if (slotIndex === 0) return 'border-purple-500 border-4';
    if (slotIndex === 1) return 'border-yellow-500 border-4';
    if (slotIndex === 2) {
      if (slot2Type === 'evo') return 'border-purple-500 border-4';
      if (slot2Type === 'hero') return 'border-yellow-500 border-4';
      const card = cardId ? ALL_CARDS_DATA.find((c) => c.id === cardId) : null;
      if (card?.evoFile) return 'border-purple-500 border-4';
      if (card?.heroFile || card?.champion) return 'border-yellow-500 border-4';
      return 'border-gray-300 border-2 animate-borderGlow';
    }
    return 'border-gray-300 border-2';
  };

  const getCardCustomSrc = (
    cardId: string,
    slotIndex: number,
    slot2Type?: 'evo' | 'hero' | null,
    slotStatus?: SlotStatus[]
  ) => {
    const status = slotStatus?.find((s) => s.slot === slotIndex);
    if (!status || !status.active) return undefined;
    const card = ALL_CARDS_DATA.find((c) => c.id === cardId);
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

  return (
    <div className={`max-w-7xl mx-auto transition-colors duration-200 ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
      <h2 className="text-2xl font-bold mb-4">Подбор колод</h2>

      <div className={`p-4 rounded-lg shadow mb-6 transition-colors duration-200 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
        <div className="flex flex-wrap items-end gap-4">
          <ProfileSwitcher profiles={players} value={selectedPlayer} className="flex-1 min-w-[200px]" onChange={handlePlayerChange} />
          <div>
            <label className={`block font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Кол-во колод
            </label>
            <input
              type="number"
              min={1}
              max={15}
              value={limit}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val >= 1 && val <= 15) {
                  if (val === limit) return;
                  setLimit(val);
                  if (recommendRequest.current) void handleRecommend(includeCards, excludeCards, val);
                }
              }}
              className={`w-20 rounded px-3 py-2 transition-colors duration-200 ${
                isDark
                  ? 'bg-gray-700 border-gray-600 text-gray-200 focus:border-blue-400'
                  : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
              } border focus:outline-none`}
            />
          </div>
          <button
            onClick={() => void handleRecommend()}
            disabled={loading}
            className={`flex items-center gap-2 px-6 py-2 rounded transition-all duration-200 ${
              loading ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-lg transform hover:scale-105'
            } ${isDark ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
          >
            {loading ? (
              <>
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
                Загрузка...
              </>
            ) : (
              <>
                <MagnifyingGlassIcon className="w-4 h-4" />
                Подобрать
              </>
            )}
          </button>
          <button
            onClick={() => setIsFilterModalOpen(true)}
            className={`flex items-center gap-1 px-3 py-2 rounded transition-colors ${
              hasActiveFilter
                ? isDark ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-500 text-white hover:bg-blue-600'
                : isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            <FunnelIcon className="w-4 h-4" />
            Фильтр
            {hasActiveFilter && (
              <span className="ml-1 bg-white text-blue-600 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                {includeCards.length + excludeCards.length}
              </span>
            )}
          </button>
          {hasActiveFilter && (
            <button
              onClick={handleClearFilter}
              className="text-sm text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
            >
              Сбросить фильтр
            </button>
          )}
          {decks.length > 0 && (
            <span className="text-sm ml-auto text-gray-500 dark:text-gray-400">
              Показано {decks.length} из {totalDecks} колод
              {hasActiveFilter && ' (отфильтровано)'}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className={`mb-4 p-3 rounded-lg ${isDark ? 'bg-red-900/50 text-red-300' : 'bg-red-100 text-red-600'}`}>
          {error}
        </div>
      )}

      <AnimatePresence mode="wait">
        {decks.length > 0 ? (
          <motion.div
            key="decks"
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={{
              hidden: { opacity: 0 },
              visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
            }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {decks.map((deck, idx) => {
              const cardCount = deck.cards.length;
              const isFull = cardCount === 8;
              const savedDeckId = isDeckSaved(deck.cards);
              return (
                <motion.div
                  key={deck.id}
                  variants={{ hidden: { opacity: 0, y: 20, scale: 0.95 }, visible: { opacity: 1, y: 0, scale: 1 } }}
                  whileHover={{ scale: 1.02, boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  className={`rounded-lg shadow p-4 border-l-4 border-blue-500 transition-colors duration-200 ${
                    isDark ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <h3 className={`font-bold text-lg ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                      #{idx + 1} {safeString(deck.name)}
                    </h3>
                    <div className={`text-sm flex items-center gap-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      <ChartBarIcon className="w-4 h-4" />
                      <span className="font-semibold">{safeString(deck.score)}</span>
                      <span className="ml-1">(Ср.ур. {safeString(deck.averageLevel)})</span>
                    </div>
                  </div>

                  <div className={`text-sm mt-1 flex flex-wrap items-center gap-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    <span>Категория: {safeString(deck.category)}</span>
                    <span>Источник: {safeString(deck.source)}</span>
                    {deck.tier && <span>Тир: {safeString(deck.tier)}</span>}
                    {deck.winRate && <span>Винрейт: {safeString(deck.winRate)}%</span>}
                    {deck.bonus > 0 && (
                      <span className="text-green-600">+{safeString(deck.bonus)} бонус</span>
                    )}
                    {deck.replacements && deck.replacements.length > 0 && (
                      <div className="text-xs text-orange-500 w-full mt-1">
                        {deck.replacements.map((r, i) => (
                          <span key={i}>
                            {safeString(r.original)} → {safeString(r.replacement)}
                            {i < deck.replacements.length - 1 && ', '}
                          </span>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => {
                        if (savedDeckId) {
                          handleDeleteSavedDeck(savedDeckId);
                        } else {
                          handleSaveDeck(deck);
                        }
                      }}
                      className={`flex items-center gap-1 text-xs transition-colors ${
                        isDark
                          ? savedDeckId ? 'text-red-400 hover:text-red-300' : 'text-blue-400 hover:text-blue-300'
                          : savedDeckId ? 'text-red-600 hover:text-red-800' : 'text-blue-600 hover:text-blue-800'
                      }`}
                    >
                      {savedDeckId ? <TrashIcon className="w-3 h-3" /> : <BookmarkIcon className="w-3 h-3" />}
                      {savedDeckId ? 'Удалить' : 'Сохранить'}
                    </button>
                  </div>

                  {!isFull && (
                    <div className="text-red-500 text-sm mt-1">⚠️ В колоде {8 - cardCount} карт. Возможно, данные повреждены.</div>
                  )}

                  <div className="grid grid-cols-4 gap-1 mt-3">
                    {deck.cards.map((cardId, idx) => {
                      const borderClass = getSlotBorderClass(idx, deck.slot2Type, cardId);
                      const customSrc = getCardCustomSrc(cardId, idx, deck.slot2Type, deck.slotStatus);
                      return (
                        <div
                          key={idx}
                          className={`relative bg-gray-50 dark:bg-gray-700 rounded p-1 flex flex-col items-center ${borderClass}`}
                        >
                          <CardIcon
                            cardId={cardId}
                            className="w-12 h-12 mx-auto"
                            customSrc={customSrc}
                          />
                          <div className="text-xs text-center mt-1 dark:text-gray-300">
                            {deck.cardLevels && deck.cardLevels[cardId] ? `Ур.${deck.cardLevels[cardId]}` : '—'}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-2 text-sm">
                    {deck.missingCardsCount === 0 ? (
                      <span className="text-green-600">✅ Все карты есть</span>
                    ) : (
                      <span className="text-orange-500">⚠️ Нет {safeString(deck.missingCardsCount)} карт</span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        ) : !loading && !error ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`text-center py-8 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}
          >
            {totalDecks === null
              ? 'Нажмите «Подобрать», чтобы получить рекомендации'
              : 'Нет колод, соответствующих фильтру'}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Модальное окно сохранения */}
      <Dialog.Root open={showSaveModal} onOpenChange={setShowSaveModal}>
        <AnimatePresence>
          {showSaveModal && (
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
                  className={`max-w-md w-full rounded-lg shadow-xl p-6 ${isDark ? 'bg-gray-800 text-gray-200' : 'bg-white text-gray-900'}`}
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
                  <Dialog.Title className="text-lg font-bold mb-4">Сохранить колоду</Dialog.Title>
                  <p className={`text-sm mb-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                    Аккаунт: <strong>{selectedPlayer}</strong>
                  </p>
                  <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    Название колоды
                  </label>
                  <input
                    type="text"
                    value={saveDeckName}
                    onChange={(e) => setSaveDeckName(e.target.value)}
                    className={`w-full rounded px-3 py-2 mb-4 transition-colors duration-200 ${
                      isDark
                        ? 'bg-gray-700 border-gray-600 text-gray-200 focus:border-blue-400'
                        : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
                    } border focus:outline-none`}
                    placeholder="Моя колода"
                    autoFocus
                  />
                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => setShowSaveModal(false)}
                      className={`px-4 py-2 rounded transition-colors ${
                        isDark ? 'bg-gray-600 hover:bg-gray-500 text-gray-200' : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
                      }`}
                    >
                      Отмена
                    </button>
                    <button
                      onClick={confirmSave}
                      disabled={saving || !saveDeckName.trim()}
                      className={`px-4 py-2 rounded transition-all ${
                        saving || !saveDeckName.trim()
                          ? 'opacity-50 cursor-not-allowed'
                          : 'hover:shadow-lg transform hover:scale-105'
                      } ${isDark ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
                    >
                      {saving ? 'Сохранение...' : 'Сохранить'}
                    </button>
                  </div>
                </motion.div>
              </Dialog.Content>
            </Dialog.Portal>
          )}
        </AnimatePresence>
      </Dialog.Root>

      <RecommendFilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        onApply={handleApplyFilter}
        onClear={handleClearFilter}
        initialInclude={includeCards}
        initialExclude={excludeCards}
        isDark={isDark}
      />
    </div>
  );
};

export default Recommend;
