import { useActivePlayer } from '../context/ActivePlayer';
import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
import { diagnoseDeck, type UpgradeDetail } from '../api';
import { useSavedDecks } from '../hooks/useSavedDecks';
import { CardIcon } from '../utils/cardImages';
import { useTheme } from '../context/ThemeContext';
import { planUpgrades } from '../utils/planUpgrades';

const formatNumber = (num: number): string => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
};

const RARITY_KEYS = ['Common', 'Rare', 'Epic', 'Legendary', 'Champion'];

const Diagnose: React.FC = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [searchParams, setSearchParams] = useSearchParams();
  const deckIdParam = searchParams.get('deckId');
  const metaDeckId = searchParams.get('metaDeckId');
  const requestedLevel = Number(searchParams.get('targetLevel'));

  const { activePlayer, players } = useActivePlayer();
  const selectedPlayer = activePlayer?.name ?? '';
  const { decks, loading: savedDecksLoading, error: savedDecksError } = useSavedDecks(selectedPlayer);
  const [preferredDeckId, setPreferredDeckId] = useState(deckIdParam || '');
  const selectedDeck = decks.find(deck => deck.id === preferredDeckId) ?? decks[0];
  const selectedDeckId = metaDeckId ?? selectedDeck?.id ?? '';
  const [diagnosis, setDiagnosis] = useState<null | {
    deckName: string;
    totalGold: number;
    targetLevel: number;
    details: (UpgradeDetail & { cardsHave: number })[];
  }>(null);
  const [targetLevel, setTargetLevel] = useState(
    Number.isInteger(requestedLevel) && requestedLevel >= 1 && requestedLevel <= 16 ? requestedLevel : 16,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [goldInput, setGoldInput] = useState('');
  const goldBalance = goldInput === '' ? null : Number(goldInput);
  const [wildcards, setWildcards] = useState<Record<string, number>>({
    Common: 0,
    Rare: 0,
    Epic: 0,
    Legendary: 0,
    Champion: 0,
  });


  useEffect(() => {
    if (!selectedDeckId || !selectedPlayer) return;
    const request = new AbortController();
    void runDiagnose(request.signal);
    return () => request.abort();
  }, [selectedDeckId, selectedPlayer, targetLevel, metaDeckId, activePlayer?.levels]);


  const runDiagnose = async (signal: AbortSignal) => {
    if (!selectedDeckId || !selectedPlayer) return;
    setLoading(true);
    setError('');
    try {
      const result = await diagnoseDeck(selectedPlayer, selectedDeckId, signal, targetLevel, metaDeckId ? 'meta' : 'saved');
      if (signal.aborted) return;
      setDiagnosis(previous => ({
        ...result,
        details: result.details.map(item => ({
          ...item,
          cardsHave: previous?.details.find(detail => detail.card === item.card)?.cardsHave ?? 0,
        })),
      }));
    } catch (err) {
      if (!signal.aborted) setError('Ошибка диагностики');
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  };

  const handleCardsHaveChange = (index: number, value: string) => {
    if (!diagnosis) return;
    const num = Math.max(0, parseInt(value) || 0);
    const newDetails = [...diagnosis.details];
    newDetails[index] = { ...newDetails[index], cardsHave: num };
    setDiagnosis({ ...diagnosis, details: newDetails });
  };

  const handleTargetLevelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = parseInt(e.target.value);
    setTargetLevel(val);
  };

  const handleWildcardChange = (rarity: string, value: string) => {
    const num = Math.max(0, parseInt(value) || 0);
    setWildcards(prev => ({ ...prev, [rarity]: num }));
  };

  const getRaritySummary = () => {
    if (!diagnosis) return null;
    const needed: Record<string, number> = {};
    const have: Record<string, number> = {};
    const unlockDeficit: Record<string, number> = {};
    RARITY_KEYS.forEach(r => { needed[r] = 0; have[r] = 0; });
    diagnosis.details.forEach(item => {
      const { rarity } = item;
      if (!rarity) return;
      const remaining = Math.max(0, item.neededCards - item.cardsHave);
      needed[rarity] += remaining;
      if (item.currentLevel === 0 && item.cardsHave === 0 && item.steps?.length) {
        unlockDeficit[rarity] = (unlockDeficit[rarity] ?? 0) + item.steps[0].copies;
      }
      have[rarity] += item.cardsHave;
    });
    const result: Record<string, number> = {};
    let totalNeeded = 0;
    RARITY_KEYS.forEach(r => {
      const wild = wildcards[r] || 0;
      const remaining = Math.max(unlockDeficit[r] ?? 0, needed[r] - wild);
      result[r] = remaining;
      totalNeeded += remaining;
    });
    return { needed, have, result, totalNeeded };
  };

  const raritySummary = getRaritySummary();
  const unopenedCards = diagnosis?.details.filter(item => item.currentLevel === 0).map(item => item.card) ?? [];
  const upgradeOrder = diagnosis ? planUpgrades(diagnosis.details, wildcards, goldBalance) : [];
  const availableSteps = upgradeOrder.filter(step => step.status === 'available');
  const pendingSteps = upgradeOrder.filter(step => step.status !== 'available');

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`max-w-4xl mx-auto transition-colors duration-200 ${
        isDark ? 'text-gray-200' : 'text-gray-900'
      }`}
    >
      <div className={`p-4 rounded-lg shadow mb-6 transition-colors duration-200 ${
        isDark ? 'bg-gray-800' : 'bg-white'
      }`}>
        <div className="grid items-end gap-4 sm:grid-cols-[1fr_1.5fr_0.8fr]">
          <label className="flex flex-col gap-1 font-medium">
            Игровой профиль
            <select className="rounded border p-2 dark:border-gray-600 dark:bg-gray-700"
              value={selectedPlayer} disabled={!players.length}
              onChange={event => setSearchParams({ player: event.target.value })}>
              {!players.length && <option value="">Нет профилей</option>}
              {players.map(player => <option key={player.id} value={player.name}>{player.name}</option>)}
            </select>
          </label>
          <div>
            <label className={`block font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Колода
            </label>
            <select
              aria-label="Колода"
              disabled={!decks.length && !metaDeckId}
              value={selectedDeckId}
              onChange={(e) => {
                if (metaDeckId) {
                  setSearchParams({ player: selectedPlayer, deckId: e.target.value, targetLevel: String(targetLevel) });
                  return;
                }
                setDiagnosis(null);
                setPreferredDeckId(e.target.value);
              }}
              className={`w-full rounded px-3 py-2 transition-colors duration-200 ${
                isDark
                  ? 'bg-gray-700 border-gray-600 text-gray-200 focus:border-blue-400'
                  : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
              } border focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
            >
              {metaDeckId && <option value={metaDeckId}>{diagnosis?.deckName ?? 'Мета-колода'}</option>}
              {!decks.length && !metaDeckId && <option value="">{savedDecksLoading ? 'Загрузка…' : 'Нет сохранённых колод'}</option>}
              {decks.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={`block font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Целевой уровень
            </label>
            <select
              aria-label="Целевой уровень"
              value={targetLevel}
              onChange={handleTargetLevelChange}
              className={`w-full rounded px-3 py-2 transition-colors duration-200 ${
                isDark
                  ? 'bg-gray-700 border-gray-600 text-gray-200 focus:border-blue-400'
                  : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
              } border focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
            >
              {Array.from({ length: 16 }, (_, i) => i + 1).map(level => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </div>
        </div>

        {selectedPlayer && !savedDecksLoading && !savedDecksError && !selectedDeckId && (
          <Link to="/decks" className="mt-3 inline-block text-sm font-medium text-blue-700 underline dark:text-blue-300">
            Выбрать колоду в каталоге
          </Link>
        )}

        <details className="mt-4 rounded-lg border border-slate-200 px-3 py-2 dark:border-gray-700">
          <summary className="cursor-pointer text-sm font-medium">Запасы золота и джокеров</summary>
          <label className="my-2 flex flex-wrap items-center gap-2 text-sm">
            Баланс золота
            <input type="number" min={0} step={1} value={goldInput} placeholder="Не указан"
              className="w-36 rounded border p-1 dark:border-gray-600 dark:bg-gray-700"
              onChange={event => {
                const value = event.target.value;
                setGoldInput(value === '' ? '' : String(Math.max(0, Math.trunc(Number(value)))));
              }} />
          </label>
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
        </details>
      </div>

      {(error || savedDecksError) && (
        <div className={`mb-4 p-3 rounded-lg ${isDark ? 'bg-red-900/50 text-red-300' : 'bg-red-100 text-red-600'}`}>
          {error || savedDecksError}
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
              Для открытия карты нужна её первая копия.
            </p>
            {diagnosis.details.some(item => item.rarity === null) && (
              <p className="mb-4 text-sm text-orange-700 dark:text-orange-300">
                Итог частичный. Для позиций с пометкой «Нет данных» стоимость неизвестна.
              </p>
            )}

            {upgradeOrder.length > 0 && (
              <details open className="mb-4 rounded border border-gray-300 p-3 dark:border-gray-600">
                <summary className="cursor-pointer font-semibold">Порядок улучшений</summary>

                <p className="my-2 text-sm">Запасы распределяются по порядку: сначала более низкие уровни, затем более дешёвые переходы на том же уровне.</p>
                <h3 className="mt-3 font-semibold text-green-700 dark:text-green-300">
                  {goldBalance === null ? 'Хватает копий' : 'Можно улучшить'} · {availableSteps.length}
                </h3>
                {goldBalance === null && <p className="text-sm">Укажите баланс золота, чтобы проверить, какие шаги доступны сейчас.</p>}
                <ol className="list-decimal space-y-1 pl-6 text-sm">
                  {availableSteps.map(step => (
                    <li key={`${step.card}-${step.level}`}>
                      {step.card} → ур. {step.level} · {step.gold.toLocaleString('ru-RU')} золота ·
                      {' '}копий: {step.cardCopiesUsed}{step.wildcardsUsed > 0 && ` + джокеров: ${step.wildcardsUsed}`}
                    </li>
                  ))}
                </ol>
                {pendingSteps.length > 0 && (
                  <details className="mt-3 border-t border-slate-200 pt-3 dark:border-gray-700">
                    <summary className="cursor-pointer font-semibold text-orange-700 dark:text-orange-300">Нужно накопить · {pendingSteps.length}</summary>
                    <ol className="mt-2 list-decimal space-y-1 pl-6 text-sm">
                      {pendingSteps.map(step => (
                        <li key={`${step.card}-${step.level}`}>
                          {step.card} → ур. {step.level} · {step.status === 'previous-step'
                            ? 'Сначала выполните предыдущий шаг'
                            : `Не хватает ${[
                              step.missingCopies ? `копий: ${step.missingCopies}` : '',
                              step.missingGold ? `золота: ${step.missingGold.toLocaleString('ru-RU')}` : '',
                            ].filter(Boolean).join(', ')}`}
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </details>
            )}
            {unopenedCards.length > 0 && <p className="mb-4 text-sm">Не открыты: {unopenedCards.join(', ')}.</p>}

            <div className="mb-4">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className={`flex items-center gap-1 transition-colors ${
                  isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-800'
                }`}
              >
                {showDetails ? (
                  <>
                    <ChevronUpIcon className="w-4 h-4" /> Скрыть запасы копий и стоимость по картам
                  </>
                ) : (
                  <>
                    <ChevronDownIcon className="w-4 h-4" /> Указать запасы копий
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
                          <td className="px-4 py-2 text-sm">{item.currentLevel || 'Не открыта'}</td>
                          <td className={`px-4 py-2 text-sm font-mono ${isDark ? 'text-gray-300' : ''}`}>
                            {!item.rarity ? 'Нет данных' : formatNumber(item.neededGold)}
                          </td>
                          <td className={`px-4 py-2 text-sm font-mono ${isDark ? 'text-gray-300' : ''}`}>
                            {!item.rarity ? 'Нет данных' : Math.max(0, item.neededCards - item.cardsHave)}
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="number"
                              min="0"
                              aria-label={`Копий карты ${item.card} в запасе`}
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
