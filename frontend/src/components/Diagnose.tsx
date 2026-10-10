import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserIcon,
  BookmarkIcon,
  ChartBarIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CurrencyDollarIcon,
  SparklesIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { getPlayers, Player, getSavedDecks, SavedDeck, diagnoseDeck } from '../api';
import { CardIcon } from '../utils/cardImages';
import { ALL_CARDS_DATA } from '../data/cards';
import { useTheme } from '../context/ThemeContext';

// ... оставляем все константы UPGRADE_CARDS, GOLD_COSTS, RARITY_KEYS и функции без изменений
const UPGRADE_CARDS: Record<string, Record<number, number>> = {
  Common: {
    1: 2, 2: 4, 3: 10, 4: 20, 5: 50, 6: 100, 7: 200, 8: 400, 9: 800, 10: 1000, 11: 1500, 12: 2500, 13: 3500, 14: 5500, 15: 7500
  },
  Rare: {
    3: 2, 4: 4, 5: 10, 6: 20, 7: 50, 8: 100, 9: 200, 10: 300, 11: 400, 12: 550, 13: 750, 14: 1000, 15: 1400
  },
  Epic: {
    6: 2, 7: 4, 8: 10, 9: 20, 10: 30, 11: 50, 12: 70, 13: 100, 14: 130, 15: 180
  },
  Legendary: {
    9: 2, 10: 4, 11: 6, 12: 9, 13: 12, 14: 14, 15: 20
  },
  Champion: {
    11: 2, 12: 5, 13: 8, 14: 11, 15: 15
  }
};

const GOLD_COSTS: Record<number, number> = {
  1: 5, 2: 20, 3: 50, 4: 150, 5: 400, 6: 1000, 7: 2000, 8: 4000, 9: 8000,
  10: 15000, 11: 25000, 12: 40000, 13: 60000, 14: 90000, 15: 120000
};

const getCardRarity = (cardId: string): string | null => {
  const card = ALL_CARDS_DATA.find(c => c.id === cardId);
  return card?.rarity || null;
};

const getNeededCards = (rarity: string | null, currentLevel: number, targetLevel: number): number => {
  if (!rarity) return 0;
  const rarityMap = UPGRADE_CARDS[rarity];
  if (!rarityMap) return 0;
  let total = 0;
  for (let lv = currentLevel; lv < targetLevel; lv++) {
    total += rarityMap[lv] || 0;
  }
  return total;
};

const getGoldNeeded = (currentLevel: number, targetLevel: number): number => {
  let total = 0;
  for (let lv = currentLevel; lv < targetLevel; lv++) {
    total += GOLD_COSTS[lv] || 0;
  }
  return total;
};

const formatNumber = (num: number): string => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
};

const RARITY_KEYS = ['Common', 'Rare', 'Epic', 'Legendary', 'Champion'];

const Diagnose: React.FC = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [searchParams] = useSearchParams();
  const deckIdParam = searchParams.get('deckId');
  const playerParam = searchParams.get('player');

  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState(playerParam || '');
  const [decks, setDecks] = useState<SavedDeck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState(deckIdParam || '');
  const [diagnosis, setDiagnosis] = useState<null | {
    deckName: string;
    totalGold: number;
    targetLevel: number;
    details: { card: string; currentLevel: number; neededGold: number; neededCards: number; cardsHave: number }[];
  }>(null);
  const [targetLevel, setTargetLevel] = useState(16);
  const [minLevel, setMinLevel] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [wildcards, setWildcards] = useState<Record<string, number>>({
    Common: 0,
    Rare: 0,
    Epic: 0,
    Legendary: 0,
    Champion: 0,
  });

  useEffect(() => {
    const fetchPlayers = async () => {
      try {
        const data = await getPlayers();
        setPlayers(data);
        if (!playerParam && data.length > 0) setSelectedPlayer(data[0].name);
      } catch (err) {
        console.error(err);
      }
    };
    fetchPlayers();
  }, []);

  useEffect(() => {
    if (selectedPlayer) {
      const fetchDecks = async () => {
        try {
          const data = await getSavedDecks(selectedPlayer);
          setDecks(data);
          if (!selectedDeckId && data.length > 0) {
            setSelectedDeckId(data[0].id);
          }
        } catch (err) {
          console.error(err);
        }
      };
      fetchDecks();
    }
  }, [selectedPlayer]);

  useEffect(() => {
    if (selectedDeckId && selectedPlayer) {
      runDiagnose();
    }
  }, [selectedDeckId, selectedPlayer, targetLevel]);

  const runDiagnose = async () => {
    if (!selectedDeckId || !selectedPlayer) return;
    setLoading(true);
    setError('');
    try {
      const result = await diagnoseDeck(selectedPlayer, selectedDeckId);
      const deck = decks.find(d => d.id === selectedDeckId);
      const cards = deck ? JSON.parse(deck.cards) : [];
      const details = cards.map((cardId: string) => {
        const card = ALL_CARDS_DATA.find(c => c.id === cardId);
        const rarity = card?.rarity || null;
        const currentLevel = result.details.find(d => d.card === cardId)?.currentLevel || 1;
        const neededGold = getGoldNeeded(currentLevel, targetLevel);
        const neededCards = getNeededCards(rarity, currentLevel, targetLevel);
        return {
          card: cardId,
          currentLevel,
          neededGold,
          neededCards,
          cardsHave: 0,
        };
      });
      const totalGold = details.reduce((sum, d) => sum + d.neededGold, 0);
      const minLevelInDeck = Math.min(...details.map(d => d.currentLevel));
      setMinLevel(minLevelInDeck);
      if (targetLevel < minLevelInDeck) {
        setTargetLevel(minLevelInDeck);
      }
      setDiagnosis({
        deckName: result.deckName,
        totalGold,
        targetLevel,
        details,
      });
    } catch (err) {
      setError('Ошибка диагностики');
    } finally {
      setLoading(false);
    }
  };

  const handleCardsHaveChange = (index: number, value: string) => {
    if (!diagnosis) return;
    const num = parseInt(value) || 0;
    const newDetails = [...diagnosis.details];
    newDetails[index].cardsHave = num;
    setDiagnosis({ ...diagnosis, details: newDetails });
  };

  const handleTargetLevelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = parseInt(e.target.value);
    setTargetLevel(val);
  };

  const handleWildcardChange = (rarity: string, value: string) => {
    const num = parseInt(value) || 0;
    setWildcards(prev => ({ ...prev, [rarity]: num }));
  };

  const getRaritySummary = () => {
    if (!diagnosis) return null;
    const needed: Record<string, number> = {};
    const have: Record<string, number> = {};
    RARITY_KEYS.forEach(r => { needed[r] = 0; have[r] = 0; });
    diagnosis.details.forEach(item => {
      const rarity = getCardRarity(item.card) || 'Common';
      const remaining = Math.max(0, item.neededCards - item.cardsHave);
      needed[rarity] += remaining;
      have[rarity] += item.cardsHave;
    });
    const result: Record<string, number> = {};
    let totalNeeded = 0;
    RARITY_KEYS.forEach(r => {
      const wild = wildcards[r] || 0;
      const remaining = Math.max(0, needed[r] - wild);
      result[r] = remaining;
      totalNeeded += remaining;
    });
    return { needed, have, result, totalNeeded };
  };

  const raritySummary = getRaritySummary();
  const selectedDeck = decks.find(d => d.id === selectedDeckId);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`max-w-4xl mx-auto transition-colors duration-200 ${
        isDark ? 'text-gray-200' : 'text-gray-900'
      }`}
    >
      <h2 className="text-2xl font-bold mb-4">Диагностика колоды</h2>

      <div className={`p-4 rounded-lg shadow mb-6 transition-colors duration-200 ${
        isDark ? 'bg-gray-800' : 'bg-white'
      }`}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={`block font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Аккаунт
            </label>
            <select
              value={selectedPlayer}
              onChange={(e) => setSelectedPlayer(e.target.value)}
              className={`w-full rounded px-3 py-2 transition-colors duration-200 ${
                isDark
                  ? 'bg-gray-700 border-gray-600 text-gray-200 focus:border-blue-400'
                  : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
              } border focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
            >
              {players.map(p => (
                <option key={p.id} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={`block font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Колода
            </label>
            <select
              value={selectedDeckId}
              onChange={(e) => setSelectedDeckId(e.target.value)}
              className={`w-full rounded px-3 py-2 transition-colors duration-200 ${
                isDark
                  ? 'bg-gray-700 border-gray-600 text-gray-200 focus:border-blue-400'
                  : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
              } border focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
            >
              {decks.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-4 items-end">
          <div>
            <label className={`block font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Целевой уровень (от {minLevel} до 16)
            </label>
            <select
              value={targetLevel}
              onChange={handleTargetLevelChange}
              className={`w-32 rounded px-3 py-2 transition-colors duration-200 ${
                isDark
                  ? 'bg-gray-700 border-gray-600 text-gray-200 focus:border-blue-400'
                  : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
              } border focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
            >
              {Array.from({ length: 16 - minLevel + 1 }, (_, i) => minLevel + i).map(level => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`text-sm font-medium self-center ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Джокеры:
            </span>
            {RARITY_KEYS.map(rarity => (
              <div key={rarity} className="flex items-center gap-1">
                <label className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{rarity}</label>
                <input
                  type="number"
                  min="0"
                  value={wildcards[rarity] || 0}
                  onChange={(e) => handleWildcardChange(rarity, e.target.value)}
                  className={`w-16 rounded px-1 py-1 text-sm text-center transition-colors duration-200 ${
                    isDark
                      ? 'bg-gray-700 border-gray-600 text-gray-200 focus:border-blue-400'
                      : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
                  } border focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
                  placeholder="0"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className={`mb-4 p-3 rounded-lg ${isDark ? 'bg-red-900/50 text-red-300' : 'bg-red-100 text-red-600'}`}>
          {error}
        </div>
      )}

      {loading && (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {diagnosis && !loading && (
          <motion.div
            key="diagnosis"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`rounded-lg shadow p-6 transition-colors duration-200 ${
              isDark ? 'bg-gray-800' : 'bg-white'
            }`}
          >
            <div className="flex flex-wrap justify-between items-start mb-4 gap-2">
              <h3 className={`text-xl font-bold ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                {diagnosis.deckName}
              </h3>
              <div className="text-right">
                <div className={`text-lg font-semibold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                  <span className="flex items-center gap-1 justify-end">
                    <CurrencyDollarIcon className="w-5 h-5" />
                    Итого: {formatNumber(diagnosis.totalGold)} золота
                  </span>
                </div>
                {raritySummary && (
                  <div className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    <span className="font-medium">Не хватает карт:</span>
                    {RARITY_KEYS.map(r => {
                      const count = raritySummary.result[r] || 0;
                      return count > 0 ? (
                        <span key={r} className="ml-2">
                          {r}: {count}
                        </span>
                      ) : null;
                    })}
                    {Object.values(wildcards).some(w => w > 0) && (
                      <span className="ml-2 text-green-600">(с учётом джокеров)</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Целевой уровень: {diagnosis.targetLevel}
            </p>

            <div className="mb-4">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className={`flex items-center gap-1 transition-colors ${
                  isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-800'
                }`}
              >
                {showDetails ? (
                  <>
                    <ChevronUpIcon className="w-4 h-4" /> Скрыть детали
                  </>
                ) : (
                  <>
                    <ChevronDownIcon className="w-4 h-4" /> Показать детали
                  </>
                )}
              </button>
            </div>

            <AnimatePresence>
              {showDetails && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-x-auto"
                >
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className={isDark ? 'bg-gray-700' : 'bg-gray-50'}>
                      <tr>
                        <th className={`px-4 py-2 text-left text-xs font-medium uppercase ${
                          isDark ? 'text-gray-400' : 'text-gray-500'
                        }`}>Карта</th>
                        <th className={`px-4 py-2 text-left text-xs font-medium uppercase ${
                          isDark ? 'text-gray-400' : 'text-gray-500'
                        }`}>Текущий уровень</th>
                        <th className={`px-4 py-2 text-left text-xs font-medium uppercase ${
                          isDark ? 'text-gray-400' : 'text-gray-500'
                        }`}>Нужно золота</th>
                        <th className={`px-4 py-2 text-left text-xs font-medium uppercase ${
                          isDark ? 'text-gray-400' : 'text-gray-500'
                        }`}>Карт нужно</th>
                        <th className={`px-4 py-2 text-left text-xs font-medium uppercase ${
                          isDark ? 'text-gray-400' : 'text-gray-500'
                        }`}>Карт есть</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-200'}`}>
                      {diagnosis.details.map((item, idx) => (
                        <tr key={idx} className={item.neededGold > 0 ? (isDark ? 'bg-gray-700/50' : 'bg-yellow-50') : ''}>
                          <td className="px-4 py-2 flex items-center gap-2">
                            <CardIcon cardId={item.card} className="w-8 h-8" />
                            <span className="text-sm">{item.card}</span>
                          </td>
                          <td className="px-4 py-2 text-sm">{item.currentLevel}</td>
                          <td className={`px-4 py-2 text-sm font-mono ${isDark ? 'text-gray-300' : ''}`}>
                            {item.neededGold > 0 ? formatNumber(item.neededGold) : '✅'}
                          </td>
                          <td className={`px-4 py-2 text-sm font-mono ${isDark ? 'text-gray-300' : ''}`}>
                            {item.neededCards > 0 ? Math.max(0, item.neededCards - item.cardsHave) : '✅'}
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="number"
                              min="0"
                              value={item.cardsHave}
                              onChange={(e) => handleCardsHaveChange(idx, e.target.value)}
                              className={`w-16 rounded px-1 py-1 text-sm text-center transition-colors duration-200 ${
                                isDark
                                  ? 'bg-gray-600 border-gray-500 text-gray-200 focus:border-blue-400'
                                  : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
                              } border focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
                              placeholder="0"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className={isDark ? 'bg-gray-700' : 'bg-gray-100'}>
                      <tr className="font-semibold">
                        <td className={`px-4 py-2 ${isDark ? 'text-gray-200' : ''}`}>Итого</td>
                        <td className="px-4 py-2"></td>
                        <td className={`px-4 py-2 ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                          {formatNumber(diagnosis.totalGold)}
                        </td>
                        <td className={`px-4 py-2 ${isDark ? 'text-gray-200' : ''}`}>
                        </td>
                        <td className="px-4 py-2"></td>
                      </tr>
                    </tfoot>
                  </table>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {!loading && !diagnosis && !error && selectedDeck && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={`text-center py-8 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}
        >
          Выберите колоду для диагностики
        </motion.div>
      )}
    </motion.div>
  );
};

export default Diagnose;
