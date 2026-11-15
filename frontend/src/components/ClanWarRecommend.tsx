import { useActivePlayer } from '../context/ActivePlayer';
import { useSavedDecks } from '../hooks/useSavedDecks';
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Dialog from '@radix-ui/react-dialog';
import {
  UserGroupIcon,
  ChartBarIcon,
  TrophyIcon,
  SparklesIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  FunnelIcon,
  BookmarkIcon,
  XMarkIcon,
  CheckIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { recommendCW, type ClanWarMode, type ClanWarUpgradePlan } from '../api';
import { CardIcon } from '../utils/cardImages';
import { ALL_CARDS_DATA } from '../data/cards';
import { useTheme } from '../context/ThemeContext';
import RecommendFilterModal from './RecommendFilterModal';

interface SlotStatus {
  slot: number;
  type: 'evo' | 'hero' | 'champion' | 'none';
  active: boolean;
}

interface CWDeck {
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
  slotStatus?: SlotStatus[];
}

interface CWCombination {
  decks: CWDeck[];
  totalScore: number;
  avgScore: number;
}

interface CWResponse {
  upgradePlan?: ClanWarUpgradePlan;
  upgradePlanBlocker?: string;
  success: boolean;
  combinations: CWCombination[];
  totalCombinations: number;
  foundSize: number;
  playerName: string;
  message?: string;
  suggestions?: string[];
}

const rarityLabels: Record<string, string> = {
  Common: 'Обычные', Rare: 'Редкие', Epic: 'Эпические', Legendary: 'Легендарные', Champion: 'Чемпионы',
};

function ClanWarPlanDetails({ plan }: { plan: ClanWarUpgradePlan }) {
  return (
    <>
      <p className="mb-2 text-sm">До ур. {plan.targetLevel} · {plan.totalGold.toLocaleString('ru-RU')} золота</p>
      <ul className="space-y-2">
        {plan.decks.map(deck => <li key={deck.deckId}>
          <strong>{deck.name}</strong>
          <p className="text-sm">{deck.cards.join(', ')}</p>
        </li>)}
      </ul>
      {plan.missingCards.length > 0 && <p className="mt-3 text-sm">Не открыты: {plan.missingCards.join(', ')}</p>}
      <p className="mt-3 text-sm font-semibold">Нужно копий по редкости</p>
      <p className="text-xs text-gray-600 dark:text-gray-300">Расчёт по уровням карт. Запасы копий и джокеров не учтены.</p>
      {Object.keys(plan.copiesByRarity).length ? (
        <ul className="text-sm">
          {Object.entries(rarityLabels).filter(([rarity]) => plan.copiesByRarity[rarity]).map(([rarity, label]) => (
            <li key={rarity}>{label}: {plan.copiesByRarity[rarity].toLocaleString('ru-RU')}</li>
          ))}
        </ul>
      ) : <p className="text-sm">Дополнительные копии не нужны.</p>}
    </>
  );
}

const ClanWarRecommend: React.FC<{ upgrade?: boolean }> = ({ upgrade = false }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const { activePlayer } = useActivePlayer();
  const selectedPlayer = activePlayer?.name ?? '';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<ClanWarMode>('saved-first');
  const [targetLevel, setTargetLevel] = useState(16);
  const [result, setResult] = useState<CWResponse | null>(null);
  const [displayLimit, setDisplayLimit] = useState(1);

  // Фильтры
  const [includeCards, setIncludeCards] = useState<string[]>([]);
  const [excludeCards, setExcludeCards] = useState<string[]>([]);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  // Сохранённые колоды для выбора
  const { decks: savedDecks } = useSavedDecks(selectedPlayer);
  const recommendationRequest = useRef<AbortController | null>(null);
  const [selectedSavedDeckIds, setSelectedSavedDeckIds] = useState<string[]>([]);
  const [isDeckSelectorOpen, setIsDeckSelectorOpen] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);

  const hasActiveFilter = includeCards.length > 0 || excludeCards.length > 0 || selectedSavedDeckIds.length > 0;


  useEffect(() => () => recommendationRequest.current?.abort(), []);

  // Функция проверки конфликтов между выбранными колодами
  const checkConflicts = (deckIds: string[]): string | null => {
    if (deckIds.length < 2) return null;

    const selectedDecks = savedDecks.filter(d => deckIds.includes(d.id));
    if (selectedDecks.length < 2) return null;

    // Находим пересечения карт
    const deckCards = selectedDecks.map(d => ({
      id: d.id,
      name: d.name,
      cards: JSON.parse(d.cards) as string[],
    }));

    const conflicts: { deck1: string; deck2: string; cards: string[] }[] = [];

    for (let i = 0; i < deckCards.length; i++) {
      for (let j = i + 1; j < deckCards.length; j++) {
        const common = deckCards[i].cards.filter(c => deckCards[j].cards.includes(c));
        if (common.length > 0) {
          conflicts.push({
            deck1: deckCards[i].name,
            deck2: deckCards[j].name,
            cards: common,
          });
        }
      }
    }

    if (conflicts.length === 0) return null;

    // Формируем читаемое сообщение
    const messages = conflicts.map(c =>
      `«${c.deck1}» и «${c.deck2}» имеют общие карты: ${c.cards.join(', ')}`
    );
    return `Невозможно использовать выбранные колоды вместе, так как они содержат одинаковые карты:\n${messages.join('\n')}`;
  };

  // Валидация при изменении выбранных колод
  const validateSelectedDecks = (ids: string[]) => {
    const conflict = checkConflicts(ids);
    setConflictError(conflict);
    setSelectedSavedDeckIds(ids);
  };

  const toggleDeckSelection = (deckId: string) => {
    setSelectedSavedDeckIds(prev => {
      if (prev.includes(deckId)) {
        const newIds = prev.filter(id => id !== deckId);
        validateSelectedDecks(newIds);
        return newIds;
      } else {
        if (prev.length >= 3) {
          alert('Можно выбрать не более 3 колод');
          return prev;
        }
        const newIds = [...prev, deckId];
        validateSelectedDecks(newIds);
        return newIds;
      }
    });
  };

  const clearDeckSelection = () => {
    setSelectedSavedDeckIds([]);
    setConflictError(null);
  };

  const handleRecommend = async () => {
    if (conflictError) {
      setError('Исправьте конфликты между выбранными колодами');
      return;
    }
    if (!selectedPlayer) {
      setError('Выберите аккаунт');
      return;
    }
    recommendationRequest.current?.abort();
    const request = new AbortController();
    recommendationRequest.current = request;
    setLoading(true);
    setError('');
    try {
      const data = await recommendCW(
        selectedPlayer,
        displayLimit,
        includeCards.length > 0 ? includeCards : undefined,
        excludeCards.length > 0 ? excludeCards : undefined,
        selectedSavedDeckIds.length > 0 ? selectedSavedDeckIds : undefined,
        request.signal,
        mode,
        upgrade ? targetLevel : undefined,
      );
      if (request.signal.aborted) return;
      if (data && data.combinations) {
        setResult(data);
      } else {
        setError('Не удалось получить рекомендации');
      }
    } catch (err) {
      if (!request.signal.aborted) setError('Ошибка получения рекомендаций для Clan Wars');
    } finally {
      if (!request.signal.aborted) setLoading(false);
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

  const formatScore = (value: number | undefined): string => {
    if (value === undefined || value === null || isNaN(value)) return '0.0';
    return value.toFixed(1);
  };

  const getCustomSrc = (cardId: string, slotIndex: number, slot2Type?: 'evo' | 'hero' | null, slotStatus?: SlotStatus[]) => {
    const status = slotStatus?.find(s => s.slot === slotIndex);
    if (!status || !status.active) return undefined;
    const card = ALL_CARDS_DATA.find(c => c.id === cardId);
    if (!card) return undefined;
    if (slotIndex === 0 && card.evoFile) {
      return `/cards/Evo/${card.evoFile}.webp`;
    }
    if (slotIndex === 1 && card.heroFile) {
      return `/cards/Hero/${card.heroFile}.webp`;
    }
    if (slotIndex === 2) {
      if (slot2Type === 'evo' && card.evoFile) {
        return `/cards/Evo/${card.evoFile}.webp`;
      }
      if (slot2Type === 'hero' && card.heroFile) {
        return `/cards/Hero/${card.heroFile}.webp`;
      }
      if (card.evoFile) {
        return `/cards/Evo/${card.evoFile}.webp`;
      }
      if (card.heroFile) {
        return `/cards/Hero/${card.heroFile}.webp`;
      }
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
      if (card?.heroFile) return 'border-yellow-500 border-4';
      return 'border-gray-300 border-2';
    }
    return 'border-gray-300 border-2';
  };

  const DeckCard = ({ deck, idx }: { deck: CWDeck; idx: number }) => {
    const slot2Type = deck.slot2Type || null;
    const slotStatus = deck.slotStatus;
    return (
      <motion.div
        variants={{
          hidden: { opacity: 0, y: 10 },
          visible: { opacity: 1, y: 0 },
        }}
        whileHover={{ scale: 1.02, boxShadow: '0 8px 20px rgba(0,0,0,0.08)' }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        className={`rounded-lg p-3 border-l-4 border-green-500 transition-colors duration-200 ${
          isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-50 hover:bg-gray-100'
        }`}
      >
        <div className="flex justify-between items-start">
          <h5 className={`font-semibold text-sm ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
            {deck.name}
          </h5>
          <div className={`text-xs flex items-center gap-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            <ChartBarIcon className="w-3 h-3" />
            <span>Рейтинг: {formatScore(deck.score)}</span>
            <span>(Ср.ур. {formatScore(deck.averageLevel)})</span>
          </div>
        </div>
        <div className={`text-xs mt-1 flex flex-wrap gap-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          {deck.tier && <span>Тир: {deck.tier}</span>}
          {deck.winRate && <span>Винрейт: {deck.winRate}%</span>}
          {deck.bonus > 0 && (
            <span className="text-green-600 flex items-center gap-1">
              <SparklesIcon className="w-3 h-3" />
              +{deck.bonus.toFixed(1)} бонус
            </span>
          )}
        </div>
        <div className="grid grid-cols-4 gap-1 mt-2">
          {deck.cards && deck.cards.map((cardId, cIdx) => {
            const borderClass = getSlotBorderClass(cIdx, slot2Type, cardId);
            const customSrc = getCustomSrc(cardId, cIdx, slot2Type, slotStatus);
            return (
              <div key={cIdx} className={`relative rounded bg-gray-50 dark:bg-gray-700 p-1 flex flex-col items-center ${borderClass}`}>
                <CardIcon cardId={cardId} className="w-10 h-10 mx-auto" customSrc={customSrc} />
              </div>
            );
          })}
        </div>
        {deck.missingCount > 0 && (
          <div className="text-orange-500 text-xs mt-1 flex items-center gap-1">
            <ExclamationTriangleIcon className="w-3 h-3" />
            Нет {deck.missingCount} карт
          </div>
        )}
      </motion.div>
    );
  };

  return (
    <div className={`max-w-7xl mx-auto transition-colors duration-200 ${
      isDark ? 'text-gray-200' : 'text-gray-900'
    }`}>
      <h2 className="text-2xl font-bold mb-4">{upgrade ? 'Четыре для КВ' : 'Clan Wars – подбор связок'}</h2>

      <div className={`p-4 rounded-lg shadow mb-6 transition-colors duration-200 ${
        isDark ? 'bg-gray-800' : 'bg-white'
      }`}>
        <div className="flex flex-wrap items-end gap-4">
          {selectedPlayer && <p className="text-sm">Аккаунт <strong>{selectedPlayer}</strong></p>}
          <label className="flex flex-col gap-1 text-sm font-medium">
            Режим подбора
            <select value={mode} className="rounded border p-2 dark:border-gray-600 dark:bg-gray-700"
              onChange={event => {
                recommendationRequest.current?.abort();
                setMode(event.target.value as ClanWarMode);
                setLoading(false);
                setResult(null);
              }}>
              <option value="saved-first">Приоритет моим колодам</option>
              <option value="best">Лучший набор</option>
            </select>
          </label>
          <p className="w-full text-sm">Обязательные карты могут быть в разных колодах одной связки.</p>
          {upgrade && (
            <label className="flex flex-col gap-1 text-sm font-medium">
              Целевой уровень
              <select value={targetLevel} disabled={loading} className="rounded border p-2 dark:bg-gray-700"
                onChange={event => { setTargetLevel(Number(event.target.value)); setResult(null); }}>
                {Array.from({ length: 16 }, (_, index) => index + 1).map(level => <option key={level}>{level}</option>)}
              </select>
            </label>
          )}
          <div>
            <label className={`block font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Кол-во связок
            </label>
            <input
              type="number"
              min={1}
              max={15}
              value={displayLimit}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val >= 1 && val <= 15) {
                  setDisplayLimit(val);
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
            onClick={handleRecommend}
            disabled={loading || !!conflictError}
            className={`flex items-center gap-2 px-6 py-2 rounded transition-all duration-200 ${
              loading || conflictError
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:shadow-lg transform hover:scale-105'
            } ${isDark ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
          >
            {loading ? (
              <>
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
                Подбор...
              </>
            ) : (
              <>
                <UserGroupIcon className="w-4 h-4" />
                Подобрать связки
              </>
            )}
          </button>

          {/* Кнопка фильтра по картам */}
          <button
            onClick={() => setIsFilterModalOpen(true)}
            className={`flex items-center gap-1 px-3 py-2 rounded transition-colors ${
              includeCards.length > 0 || excludeCards.length > 0
                ? isDark ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-500 text-white hover:bg-blue-600'
                : isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            <FunnelIcon className="w-4 h-4" />
            Карты
            {(includeCards.length + excludeCards.length) > 0 && (
              <span className="ml-1 bg-white text-blue-600 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                {includeCards.length + excludeCards.length}
              </span>
            )}
          </button>

          {/* Кнопка выбора сохранённых колод */}
          <button
            onClick={() => setIsDeckSelectorOpen(true)}
            className={`flex items-center gap-1 px-3 py-2 rounded transition-colors ${
              selectedSavedDeckIds.length > 0
                ? isDark ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-green-500 text-white hover:bg-green-600'
                : isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            <BookmarkIcon className="w-4 h-4" />
            Колоды
            {selectedSavedDeckIds.length > 0 && (
              <span className="ml-1 bg-white text-green-600 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                {selectedSavedDeckIds.length}
              </span>
            )}
          </button>

          {hasActiveFilter && (
            <button
              onClick={() => {
                setIncludeCards([]);
                setExcludeCards([]);
                clearDeckSelection();
              }}
              className="text-sm text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
            >
              Сбросить все фильтры
            </button>
          )}
        </div>
        {/* Блок отображения конфликта */}
        {conflictError && (
          <div className={`mt-3 p-3 rounded-lg flex items-start gap-2 ${
            isDark ? 'bg-red-900/30 text-red-300' : 'bg-red-100 text-red-700'
          }`}>
            <InformationCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="whitespace-pre-wrap text-sm">{conflictError}</div>
          </div>
        )}
      </div>

      {error && (
        <div className={`mb-4 p-3 rounded-lg ${
          isDark ? 'bg-red-900/50 text-red-300' : 'bg-red-100 text-red-600'
        }`}>
          {error}
        </div>
      )}

      <AnimatePresence mode="wait">
        {result && (
          <motion.div
            key="result"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {upgrade && (
              <div className="grid gap-4 md:grid-cols-2">
                <section className="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
                  <h3 className="font-bold">Могу сыграть сейчас</h3>
                  {result.combinations[0] ? (
                    <>
                      <p className="mb-2 text-sm">{result.foundSize} из 4 колод</p>
                      <ul className="space-y-2">
                        {result.combinations[0].decks.map(deck => <li key={deck.deckId}>
                          <strong>{deck.name}</strong>
                          <p className="text-sm">{deck.cards.join(', ')}</p>
                        </li>)}
                      </ul>
                    </>
                  ) : <p>{result.message ?? 'Готовой связки с этими условиями нет.'}</p>}
                </section>
                <section className="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
                  <h3 className="font-bold">Что нужно для четырёх</h3>
                  {result.upgradePlan ? <ClanWarPlanDetails plan={result.upgradePlan} />
                    : <p>{result.upgradePlanBlocker ?? 'План не найден.'}</p>}
                </section>
              </div>
            )}
            {!upgrade && result.message && (
              <div role="status" className="rounded-lg bg-yellow-100 p-4 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-300">
                <p className="font-semibold">
                  {result.foundSize ? `Можно сыграть сейчас: ${result.foundSize} из 4 колод` : 'Готовой связки с этими условиями нет'}
                </p>
                <p>{result.message}</p>
                {result.suggestions?.map(suggestion => <p key={suggestion}>{suggestion}</p>)}
              </div>
            )}

            {/* Сводка */}
            {!upgrade && result.combinations.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-4 rounded-lg shadow flex flex-wrap justify-between items-center ${
                  isDark ? 'bg-gray-800' : 'bg-white'
                }`}
              >
                <span className="font-semibold text-lg flex items-center gap-2">
                  <TrophyIcon className="w-5 h-5 text-yellow-500" />
                  Найдено связок: {result.totalCombinations}
                </span>
                <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Размер связки: {result.foundSize} колод
                </span>
              </motion.div>
            )}

            {/* Список связок */}
            <motion.div
              initial="hidden"
              animate="visible"
              variants={{
                hidden: { opacity: 0 },
                visible: {
                  opacity: 1,
                  transition: {
                    staggerChildren: 0.05,
                  },
                },
              }}
              className="space-y-4"
            >
              {!upgrade && result.combinations.map((combo, idx) => (
                <motion.div
                  key={idx}
                  variants={{
                    hidden: { opacity: 0, y: 20, scale: 0.95 },
                    visible: { opacity: 1, y: 0, scale: 1 },
                  }}
                  whileHover={{ scale: 1.01, boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  className={`rounded-lg shadow p-4 mb-4 border-l-4 border-blue-500 transition-colors duration-200 ${
                    isDark ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="flex justify-between items-center mb-2">
                    <h4 className={`font-bold text-lg ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                      Связка #{idx + 1}
                    </h4>
                    <div className={`text-sm flex items-center gap-3 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      <span className="font-semibold flex items-center gap-1">
                        <ChartBarIcon className="w-4 h-4" />
                        Суммарный рейтинг: {formatScore(combo.totalScore)}
                      </span>
                      <span>(Ср.: {formatScore(combo.avgScore)})</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {combo.decks.map((deck, dIdx) => (
                      <DeckCard key={dIdx} deck={deck} idx={dIdx} />
                    ))}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {!loading && !result && !error && (
        <div className={`text-center py-8 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          Нажмите «Подобрать связки», чтобы получить рекомендации для Clan Wars.
        </div>
      )}

      {/* Модалка фильтра по картам (максимум 16 карт) */}
      <RecommendFilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        onApply={handleApplyFilter}
        onClear={handleClearFilter}
        initialInclude={includeCards}
        initialExclude={excludeCards}
        isDark={isDark}
        maxCards={16}
      />

      {/* Модалка выбора сохранённых колод */}
      <Dialog.Root open={isDeckSelectorOpen} onOpenChange={setIsDeckSelectorOpen}>
        <AnimatePresence>
          {isDeckSelectorOpen && (
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
                  className={`max-w-2xl w-full max-h-[80vh] rounded-lg shadow-xl p-6 overflow-y-auto ${
                    isDark ? 'bg-gray-800 text-gray-200' : 'bg-white text-gray-900'
                  }`}
                >
                  <Dialog.Close asChild>
                    <button
                      className={`absolute top-2 right-2 p-1 rounded-full transition-colors ${
                        isDark
                          ? 'hover:bg-gray-700 text-gray-400'
                          : 'hover:bg-gray-100 text-gray-600'
                      }`}
                      aria-label="Закрыть"
                    >
                      <XMarkIcon className="w-5 h-5" />
                    </button>
                  </Dialog.Close>

                  <Dialog.Title className="text-lg font-bold mb-4">
                    Выберите колоды, которые обязательно должны быть в связке (до 3)
                  </Dialog.Title>

                  <div className="space-y-2 mb-4">
                    {savedDecks.length === 0 ? (
                      <p className={`text-center py-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        У вас нет сохранённых колод. Сохраните колоды на странице "Подбор".
                      </p>
                    ) : (
                      savedDecks.map(deck => {
                        const cards = JSON.parse(deck.cards);
                        const isSelected = selectedSavedDeckIds.includes(deck.id);
                        return (
                          <div
                            key={deck.id}
                            onClick={() => toggleDeckSelection(deck.id)}
                            className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                              isSelected
                                ? isDark ? 'bg-blue-900/30 border border-blue-500' : 'bg-blue-50 border border-blue-500'
                                : isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'
                            }`}
                          >
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                              isSelected ? 'border-blue-500 bg-blue-500 text-white' : 'border-gray-400'
                            }`}>
                              {isSelected && <CheckIcon className="w-4 h-4" />}
                            </div>
                            <div className="flex-1">
                              <div className="font-medium">{deck.name}</div>
                              <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                {cards.join(', ')}
                              </div>
                            </div>
                            <div className="flex gap-0.5">
                              {cards.slice(0, 4).map((cardId: string) => (
                                <CardIcon key={cardId} cardId={cardId} className="w-6 h-6" />
                              ))}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {conflictError && (
                    <div className={`mb-3 p-3 rounded-lg text-sm ${
                      isDark ? 'bg-red-900/30 text-red-300' : 'bg-red-100 text-red-700'
                    }`}>
                      <div className="flex items-start gap-2">
                        <InformationCircleIcon className="w-5 h-5 flex-shrink-0" />
                        <div className="whitespace-pre-wrap">{conflictError}</div>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-3">
                    <button
                      onClick={clearDeckSelection}
                      className={`px-4 py-2 rounded transition-colors ${
                        isDark
                          ? 'bg-gray-600 hover:bg-gray-500 text-gray-200'
                          : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
                      }`}
                    >
                      Снять все
                    </button>
                    <button
                      onClick={() => setIsDeckSelectorOpen(false)}
                      className={`px-4 py-2 rounded transition-colors ${
                        isDark
                          ? 'bg-blue-600 hover:bg-blue-700 text-white'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      Готово
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

export default ClanWarRecommend;
