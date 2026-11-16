import { useActivePlayer } from '../context/ActivePlayer';
import { useState, useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { CardIcon } from '../utils/cardImages';
import { cardTranslations } from '../utils/cardTranslations';

import BattleScene from './BattleScene';
import { CYCLES, getRoundOutcome, type RoundOutcome } from '../utils/duelRound';

export default function Home({ theme }: { theme: string }) {
  const isDark = theme === 'dark';
  const reducedMotion = useReducedMotion();

  const { players, activePlayer } = useActivePlayer();
  const selectedPlayer = activePlayer?.name ?? '';
  const [gameState, setGameState] = useState<'idle' | 'preSelect' | 'countdown' | 'playing' | 'animating' | 'result' | 'gameOver'>('idle');
  const [countdown, setCountdown] = useState(3);
  const [playerCards, setPlayerCards] = useState<string[]>([]);
  const [opponentCard, setOpponentCard] = useState('');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [result, setResult] = useState<RoundOutcome | null>(null);
  const [finalChoice, setFinalChoice] = useState<string | null>(null);
  const [playerScore, setPlayerScore] = useState(0);
  const [computerScore, setComputerScore] = useState(0);
  const [record, setRecord] = useState(0);
  const [showRecord, setShowRecord] = useState(false);
  const [gameSaved, setGameSaved] = useState(false);

  const playerScoreRef = useRef(0);
  const computerScoreRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const pendingOutcome = useRef<RoundOutcome | null>(null);

  // Рефы для хранения актуальных данных
  const gameDataRef = useRef<{
    cycle: string[];
    opponentCard: string;
    playerCards: string[];
  }>({ cycle: [], opponentCard: '', playerCards: [] });

  const playerChoiceRef = useRef<string | null>(null);

  // ---------- Функции работы с сохранением ----------
  const getPlayerStorageId = (playerName: string) =>
    players.find(player => player.name === playerName)?.id || '';
  const getRecordKey = (playerName: string) => `rps_record_${getPlayerStorageId(playerName)}`;
  const getProgressKey = (playerName: string) => `rps_score_${getPlayerStorageId(playerName)}`;

  const loadRecord = (playerName: string): number => {
    const key = getRecordKey(playerName);
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const value = parseInt(saved, 10) || 0;
        localStorage.setItem(key, String(value));
        return value;
      } catch (e) {
        return 0;
      }
    }
    return 0;
  };

  const saveRecord = (playerName: string, value: number) => {
    const key = getRecordKey(playerName);
    localStorage.setItem(key, String(value));
  };

  const loadProgress = (playerName: string) => {
    const key = getProgressKey(playerName);
    const saved = localStorage.getItem(key);
    playerScoreRef.current = 0;
    computerScoreRef.current = 0;
    setPlayerScore(0);
    setComputerScore(0);
    setGameSaved(false);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        const playerProgress = typeof data.playerScore === 'number' ? data.playerScore : 0;
        const computerProgress = typeof data.computerScore === 'number' ? data.computerScore : 0;
        localStorage.setItem(key, JSON.stringify({
          playerScore: playerProgress,
          computerScore: computerProgress,
        }));
        playerScoreRef.current = playerProgress;
        computerScoreRef.current = computerProgress;
        setPlayerScore(playerProgress);
        setComputerScore(computerProgress);
        setGameSaved(true);
      } catch (e) {
        console.error('Ошибка загрузки прогресса', e);
      }
    }
    // Загружаем рекорд отдельно
    setRecord(loadRecord(playerName));
  };

  const saveProgress = () => {
    if (!selectedPlayer) return;
    const key = getProgressKey(selectedPlayer);
    const data = { playerScore, computerScore };
    localStorage.setItem(key, JSON.stringify(data));
    setGameSaved(true);
    // Также сохраняем рекорд отдельно (если он изменился)
    saveRecord(selectedPlayer, record);
  };

  // Удаляем прогресс из localStorage, но НЕ обнуляем состояние (счёт остаётся для отображения)
  const clearProgress = () => {
    if (!selectedPlayer) return;
    const key = getProgressKey(selectedPlayer);
    localStorage.removeItem(key);
    setGameSaved(false);
  };

  function cancelRound() {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingOutcome.current = null;
  }

  // Загрузка прогресса и рекорда при смене игрока
  useEffect(() => {
    playerScoreRef.current = 0;
    computerScoreRef.current = 0;
    setPlayerScore(0);
    setComputerScore(0);
    setRecord(0);
    setGameSaved(false);
    setShowRecord(false);
    setGameState('idle');
    playerChoiceRef.current = null;
    gameDataRef.current = { cycle: [], opponentCard: '', playerCards: [] };
    cancelRound();
    if (selectedPlayer) {
      loadProgress(selectedPlayer);
    }
    return cancelRound;
  }, [selectedPlayer]);

  // ---------- Игровые функции ----------
  const endGame = () => {
    // Обновляем рекорд, если текущий счёт игрока больше
    const currentRecord = loadRecord(selectedPlayer);
    if (playerScore > currentRecord) {
      saveRecord(selectedPlayer, playerScore);
      setRecord(playerScore);
    }
    // Удаляем прогресс (счёт остаётся для отображения)
    clearProgress();
    setGameState('gameOver');
  };

  const startNewGame = () => {
    cancelRound();
    playerScoreRef.current = 0;
    computerScoreRef.current = 0;
    // Удаляем прогресс (если есть)
    clearProgress();
    // Обнуляем счёт
    setPlayerScore(0);
    setComputerScore(0);
    playerChoiceRef.current = null;
    gameDataRef.current = { cycle: [], opponentCard: '', playerCards: [] };
    // Рекорд загружаем заново
    setRecord(loadRecord(selectedPlayer));
    startRound();
  };

  const continueGame = () => {
    if (gameSaved) startRound();
  };

  const startRound = () => {
    cancelRound();
    const randomCycle = CYCLES[Math.floor(Math.random() * CYCLES.length)];
    const randomOpponent = randomCycle[Math.floor(Math.random() * randomCycle.length)];
    const shuffledPlayerCards = [...randomCycle].sort(() => Math.random() - 0.5);

    gameDataRef.current = {
      cycle: randomCycle,
      opponentCard: randomOpponent,
      playerCards: shuffledPlayerCards,
    };
    playerChoiceRef.current = null;

    setPlayerCards(shuffledPlayerCards);
    setOpponentCard(randomOpponent);
    setSelectedIndex(null);
    setResult(null);
    setFinalChoice(null);
    setGameState('preSelect');
    setCountdown(3);

    function tick(remaining: number) {
      setCountdown(remaining);
      if (remaining === 0) {
        setGameState('playing');
        timerRef.current = window.setTimeout(finishRound, 500);
      } else {
        timerRef.current = window.setTimeout(() => tick(remaining - 1), 1000);
      }
    }
    timerRef.current = window.setTimeout(() => {
      setGameState('countdown');
      tick(3);
    }, 1500);
  };

  const finishRound = () => {
    const { cycle, opponentCard, playerCards } = gameDataRef.current;
    let chosen: string;
    const savedChoice = playerChoiceRef.current;
    if (savedChoice) {
      chosen = savedChoice;
    } else {
      const randomIndex = Math.floor(Math.random() * playerCards.length);
      chosen = playerCards[randomIndex];
      setSelectedIndex(randomIndex);
      playerChoiceRef.current = chosen;
    }
    determineResult(chosen, cycle, opponentCard);
  };

  const handleChoice = (cardId: string, index: number) => {
    if (gameState === 'preSelect' || gameState === 'countdown' || gameState === 'playing') {
      setSelectedIndex(index);
      playerChoiceRef.current = cardId;
    }
  };

  const determineResult = (chosen: string, cycle: string[], opponent: string) => {
    const outcome = getRoundOutcome(cycle, chosen, opponent);
    pendingOutcome.current = outcome;
    setResult(outcome);
    setFinalChoice(chosen);
    setGameState('animating');
  };

  const completeRound = () => {
    const outcome = pendingOutcome.current;
    if (!outcome) return;
    pendingOutcome.current = null;
    const playerTotal = playerScoreRef.current + Number(outcome === 'win');
    const computerTotal = computerScoreRef.current + Number(outcome === 'lose');
    playerScoreRef.current = playerTotal;
    computerScoreRef.current = computerTotal;
    setPlayerScore(playerTotal);
    setComputerScore(computerTotal);

    if (selectedPlayer) {
      localStorage.setItem(getProgressKey(selectedPlayer), JSON.stringify({
        playerScore: playerTotal,
        computerScore: computerTotal,
      }));
      setGameSaved(true);
    }

    if (computerTotal - playerTotal >= 3) {
      if (playerTotal > loadRecord(selectedPlayer)) {
        saveRecord(selectedPlayer, playerTotal);
        setRecord(playerTotal);
      }
      clearProgress();
      setGameState('gameOver');
    } else {
      setGameState('result');
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState === 'preSelect' || gameState === 'countdown' || gameState === 'playing') {
        const key = parseInt(e.key);
        if (key >= 1 && key <= 3 && playerCards[key - 1]) {
          handleChoice(playerCards[key - 1], key - 1);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, playerCards]);

  // ---------- Рендер ----------
  if (gameState === 'idle' || gameState === 'gameOver') {
    const diff = computerScore - playerScore;
    const isGameOver = gameState === 'gameOver';

    return (
      <div className="max-w-2xl mx-auto text-center py-6">
        <h1 className="text-4xl font-bold mb-2">Карточная дуэль</h1>
        <p className="text-lg mb-6 max-w-xl mx-auto text-gray-600 dark:text-gray-300">
          Выберите одну из трёх карт. Каждая побеждает одну соперницу и уступает другой.
        </p>

        <div className={`p-3 sm:p-6 rounded-2xl shadow-xl ${isDark ? 'bg-gray-800' : 'bg-white'}`}>

          {isGameOver && diff >= 3 && result && finalChoice && (
            <BattleScene player={finalChoice} computer={opponentCard} outcome={result} animating={false} />
          )}

          {isGameOver && (
            <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <p className="text-xl font-bold text-red-600 dark:text-red-400">
                {diff >= 3 ? '💀 Поражение!' : '🏁 Игра завершена'}
              </p>
              <p className="text-sm">{diff >= 3 ? 'Компьютер обошёл вас на 3 очка.' : 'Вы завершили игру досрочно.'}</p>
              <p className="text-sm mt-1">Ваш счёт: {playerScore} | Компьютер: {computerScore}</p>
              <p className="text-sm mt-1">🏆 Рекорд: {record} побед</p>
            </div>
          )}

          {selectedPlayer && <p className="mb-4 text-sm">Аккаунт <strong>{selectedPlayer}</strong></p>}

          <div className="flex flex-wrap gap-3 justify-center">
            <button
              onClick={startNewGame}
              disabled={!selectedPlayer}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              Новая игра
            </button>
            {gameSaved && !isGameOver && (
              <>
                <button
                  onClick={continueGame}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Продолжить
                </button>
                <button
                  onClick={endGame}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Завершить
                </button>
              </>
            )}
            <button
              onClick={() => setShowRecord(!showRecord)}
              className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
            >
              Рекорд
            </button>
          </div>

          {showRecord && (
            <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
              <p className="text-sm">Лучший результат для {selectedPlayer}: {record} побед</p>
            </div>
          )}

          {!isGameOver && gameSaved && (
            <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              Текущий счёт: {playerScore} - {computerScore}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------- Игровой процесс ----------
  const diff = computerScore - playerScore;
  const isNearLose = diff >= 1 && diff < 3;

  return (
    <div className="max-w-2xl mx-auto text-center py-6">
      <div className={`p-6 rounded-2xl shadow-xl ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
        <h2 className="text-2xl font-semibold mb-2">⚡ Карточная дуэль</h2>
        <div className="flex justify-center gap-4 mb-4 text-sm">
          <span className="text-green-500">🏆 Игрок: {playerScore}</span>
          <span className="text-red-500">💻 Компьютер: {computerScore}</span>
          {isNearLose && (
            <span className="text-yellow-500">
              ⚠️ Осталось {3 - diff} поражений до конца игры
            </span>
          )}
        </div>

        {/* Карты игрока */}
        {(gameState === 'preSelect' || gameState === 'countdown' || gameState === 'playing') && (
          <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4">
            {playerCards.map((cardId, index) => {
              const isSelected = selectedIndex === index;
              let cardClass = 'p-2 rounded-xl cursor-pointer transition-all duration-200 border-2 ';
              if (isSelected) {
                cardClass += 'border-green-500 ring-2 ring-green-400';
              } else {
                cardClass += 'border-gray-300 dark:border-gray-600 hover:border-blue-400';
              }
              return (
                <motion.button
                  key={cardId}
                  type="button"
                  aria-pressed={isSelected}
                  initial={reducedMotion ? false : { opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={reducedMotion ? undefined : { scale: 1.05 }}
                  whileTap={reducedMotion ? undefined : { scale: 0.95 }}
                  className={cardClass}
                  onClick={() => handleChoice(cardId, index)}
                >
                  <CardIcon cardId={cardId} className="h-14 w-full sm:h-16" />
                  <p className="text-xs mt-1 truncate">{cardTranslations[cardId] || cardId}</p>
                </motion.button>
              );
            })}
          </div>
        )}

        {(gameState === 'animating' || gameState === 'result') && result && finalChoice && (
          <BattleScene player={finalChoice} computer={opponentCard} outcome={result}
            animating={gameState === 'animating'} onComplete={completeRound} />
        )}

        {/* Карта соперника открывается в конце выбора */}
          {gameState === 'playing' && (
            <motion.div
              initial={reducedMotion ? false : { scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="mb-4"
            >
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Соперник:</div>
              <div className="inline-block p-2 rounded-xl bg-gray-100 dark:bg-gray-700">
                <CardIcon cardId={opponentCard} className="w-20 h-20" />
                <p className="text-xs mt-1">{cardTranslations[opponentCard] || opponentCard}</p>
              </div>
            </motion.div>
          )}

        {/* Обратный отсчёт */}
        {gameState === 'countdown' && (
          <motion.div
            key="countdown"
            initial={reducedMotion ? false : { scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            className="text-6xl font-bold my-4"
          >
            {countdown}
          </motion.div>
        )}

        {gameState === 'result' && (
          <div className="flex flex-wrap gap-3 justify-center mt-4">
            <button
              onClick={startRound}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Готов к следующему раунду
            </button>
            <button
              onClick={endGame}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              🏁 Завершить игру
            </button>
            <button
              onClick={() => { saveProgress(); setGameState('idle'); }}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Выйти
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
