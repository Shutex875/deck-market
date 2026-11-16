import PlayerResourceLink from './PlayerResourceLink';
import UpgradeCopyCoverage from './UpgradeCopyCoverage';
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
import { diagnoseDeck } from '../api';
import { useSavedDecks } from '../hooks/useSavedDecks';
import { CardIcon } from '../utils/cardImages';
import { useTheme } from '../context/ThemeContext';
import { planUpgrades } from '../utils/planUpgrades';

const formatNumber = (num: number): string => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
};

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
  const [diagnosis, setDiagnosis] = useState<Awaited<ReturnType<typeof diagnoseDeck>> | null>(null);
  const [targetLevel, setTargetLevel] = useState(
    Number.isInteger(requestedLevel) && requestedLevel >= 1 && requestedLevel <= 16 ? requestedLevel : 16,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const resources = activePlayer?.resources;
  const goldBalance = resources?.gold ?? 0;
  const wildcards: Record<string, number> = resources?.wildcards ?? {};
  const details = diagnosis?.details ?? [];

  useEffect(() => {
    if (!selectedDeckId || !selectedPlayer) return;
    const request = new AbortController();
    void runDiagnose(request.signal);
    return () => request.abort();
  }, [selectedDeckId, selectedPlayer, targetLevel, metaDeckId, activePlayer?.levels, resources]);


  const runDiagnose = async (signal: AbortSignal) => {
    if (!selectedDeckId || !selectedPlayer) return;
    setLoading(true);
    setError('');
    try {
      const result = await diagnoseDeck(selectedPlayer, selectedDeckId, signal, targetLevel, metaDeckId ? 'meta' : 'saved');
      if (signal.aborted) return;
      setDiagnosis(result);
    } catch (err) {
      if (!signal.aborted) setError('Ошибка диагностики');
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  };

  const handleTargetLevelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = parseInt(e.target.value);
    setTargetLevel(val);
  };

  const unopenedCards = diagnosis?.details.filter(item => item.currentLevel === 0).map(item => item.card) ?? [];
  const upgradeOrder = planUpgrades(details, wildcards, goldBalance);
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

        <div className="mt-4 border-t border-slate-200 pt-3 dark:border-gray-700">
          <PlayerResourceLink player={activePlayer} />
        </div>
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
                <UpgradeCopyCoverage {...diagnosis} />
                {diagnosis.goldDeficit > 0 && <p className="text-sm">Не хватает золота: {diagnosis.goldDeficit.toLocaleString('ru-RU')}</p>}
                {!diagnosis.goldDeficit && !diagnosis.uncoveredCopies && diagnosis.details.every(item => item.rarity) && (
                  <p className="text-sm text-green-700 dark:text-green-300">Прокачка уровней покрыта известными ресурсами.</p>
                )}
              </div>
            </div>

            <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Для открытия карты нужна её первая копия. Джокеры могут покрыть следующие уровни после открытия.
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
                  Можно улучшить · {availableSteps.length}
                </h3>
                <ol className="list-decimal space-y-1 pl-6 text-sm">
                  {availableSteps.map(step => (
                    <li key={`${step.card}-${step.level}`}>
                      {step.card} → ур. {step.level} · {step.gold.toLocaleString('ru-RU')} золота ·
                      {' '}покрыто джокерами: {step.wildcardsUsed}
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
                            : ([
                              step.uncoveredCopies ? `Не покрыто джокерами: ${step.uncoveredCopies}` : '',
                              step.missingGold ? `Не хватает золота: ${step.missingGold.toLocaleString('ru-RU')}` : '',
                            ].filter(Boolean).join(' · '))}
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
                    <ChevronUpIcon className="w-4 h-4" /> Скрыть требования
                  </>
                ) : (
                  <>
                    <ChevronDownIcon className="w-4 h-4" /> Требования по картам
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
                        }`}>Требуется копий</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-200'}`}>
                      {details.map((item, idx) => (
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
                            {!item.rarity ? 'Нет данных' : item.neededCards}
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
