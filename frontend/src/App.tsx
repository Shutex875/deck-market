import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';
import { getPlayers, Player } from './api';
import { CardIcon } from './utils/cardImages';
import { cardTranslations } from './utils/cardTranslations';

import PlayerList from './components/PlayerList';
import PlayerForm from './components/PlayerForm';
import DeckList from './components/DeckList';
import DeckBuilder from './components/DeckBuilder';
import Recommend from './components/Recommend';
import ClanWarRecommend from './components/ClanWarRecommend';
import Diagnose from './components/Diagnose';
import SavedDecks from './components/SavedDecks';
import PlayerStats from './components/PlayerStats';

// ---------- Игровая логика ----------
const CYCLES = [
  ['Electro Wizard', 'Inferno Dragon', 'Mega Knight'],
  ['Skeleton Army', 'PEKKA', 'Wizard'],
  ['Electro Wizard', 'Sparky', 'PEKKA'],
  ['Arrows', 'Horde', 'Mini PEKKA'],
  ['Dark Prince', 'Guards', 'Ronin'],
  ['Prince', 'Magic Archer', 'Bats'],
  ['Lumberjack', 'Musketeer', 'Minions'],
];

const getWinningCard = (cycle: string[], opponent: string): string => {
  const index = cycle.indexOf(opponent);
  return cycle[(index + 2) % 3];
};

const doesBeat = (cycle: string[], card1: string, card2: string): boolean => {
  return getWinningCard(cycle, card2) === card1;
};

// ---------- Компонент Home ----------
function Home({ theme }: { theme: string }) {
  const isDark = theme === 'dark';

  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState('');
  const [gameState, setGameState] = useState<'idle' | 'preSelect' | 'countdown' | 'playing' | 'result' | 'gameOver'>('idle');
  const [countdown, setCountdown] = useState(3);
  const [playerCards, setPlayerCards] = useState<string[]>([]);
  const [opponentCard, setOpponentCard] = useState('');
  const [playerChoice, setPlayerChoice] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [result, setResult] = useState<'win' | 'lose' | 'draw' | null>(null);
  const [finalChoice, setFinalChoice] = useState<string | null>(null);
  const [playerScore, setPlayerScore] = useState(0);
  const [computerScore, setComputerScore] = useState(0);
  const [record, setRecord] = useState(0);
  const [showRecord, setShowRecord] = useState(false);
  const [gameSaved, setGameSaved] = useState(false);
  const [showButtons, setShowButtons] = useState(false);

  const timerRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);

  // Рефы для хранения актуальных данных
  const gameDataRef = useRef<{
    cycle: string[];
    opponentCard: string;
    playerCards: string[];
  }>({ cycle: [], opponentCard: '', playerCards: [] });

  const playerChoiceRef = useRef<string | null>(null);

  // ---------- Функции работы с сохранением ----------
  const getRecordKey = (playerName: string) => `game_record_${playerName}`;
  const getProgressKey = (playerName: string) => `game_progress_${playerName}`;

  const loadRecord = (playerName: string): number => {
    const key = getRecordKey(playerName);
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        return parseInt(saved, 10) || 0;
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
    if (saved) {
      try {
        const data = JSON.parse(saved);
        setPlayerScore(data.playerScore || 0);
        setComputerScore(data.computerScore || 0);
        setGameSaved(true);
      } catch (e) {
        console.error('Ошибка загрузки прогресса', e);
        setGameSaved(false);
      }
    } else {
      setGameSaved(false);
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

  // Загрузка игроков
  useEffect(() => {
    const fetchPlayers = async () => {
      try {
        const data = await getPlayers();
        setPlayers(data);
        if (data.length > 0) setSelectedPlayer(data[0].name);
      } catch (err) {
        console.error('Ошибка загрузки игроков', err);
      }
    };
    fetchPlayers();
  }, []);

  // Загрузка прогресса и рекорда при смене игрока
  useEffect(() => {
    if (selectedPlayer) {
      loadProgress(selectedPlayer);
    }
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
    setShowButtons(false);
  };

  const startNewGame = () => {
    // Удаляем прогресс (если есть)
    clearProgress();
    // Обнуляем счёт
    setPlayerScore(0);
    setComputerScore(0);
    // Рекорд загружаем заново
    setRecord(loadRecord(selectedPlayer));
    setGameState('idle');
    setTimeout(() => startRound(), 300);
  };

  const continueGame = () => {
    if (gameSaved) {
      setGameState('idle');
      setTimeout(() => startRound(), 300);
    }
  };

  const startRound = () => {
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
    setPlayerChoice(null);
    setSelectedIndex(null);
    setResult(null);
    setFinalChoice(null);
    setShowButtons(false);
    setGameState('preSelect');
    setCountdown(3);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setGameState('countdown');
      if (countdownRef.current) clearInterval(countdownRef.current);
      countdownRef.current = window.setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownRef.current!);
            setGameState('playing');
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = window.setTimeout(() => {
              finishRound();
            }, 500);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
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
      setPlayerChoice(chosen);
      playerChoiceRef.current = chosen;
    }
    determineResult(chosen, cycle, opponentCard);
  };

  const handleChoice = (cardId: string, index: number) => {
    if (gameState === 'preSelect' || gameState === 'countdown' || gameState === 'playing') {
      setSelectedIndex(index);
      setPlayerChoice(cardId);
      playerChoiceRef.current = cardId;
    }
  };

  const determineResult = (chosen: string, cycle: string[], opponent: string) => {
    let newResult: 'win' | 'lose' | 'draw';
    let newPlayerScore = playerScore;
    let newComputerScore = computerScore;

    if (chosen === opponent) {
      newResult = 'draw';
    } else if (doesBeat(cycle, chosen, opponent)) {
      newResult = 'win';
      newPlayerScore = playerScore + 1;
    } else {
      newResult = 'lose';
      newComputerScore = computerScore + 1;
    }

    setResult(newResult);
    setFinalChoice(chosen);
    setPlayerScore(newPlayerScore);
    setComputerScore(newComputerScore);
    setGameState('result');
    setShowButtons(false);

    // Автосохранение
    if (selectedPlayer) {
      const key = getProgressKey(selectedPlayer);
      const data = { playerScore: newPlayerScore, computerScore: newComputerScore };
      localStorage.setItem(key, JSON.stringify(data));
      setGameSaved(true);
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setShowButtons(true);
    }, 1500);

    // Проверка окончания игры (поражение)
    const diff = newComputerScore - newPlayerScore;
    if (diff >= 3) {
      // Обновляем рекорд
      const currentRecord = loadRecord(selectedPlayer);
      if (newPlayerScore > currentRecord) {
        saveRecord(selectedPlayer, newPlayerScore);
        setRecord(newPlayerScore);
      }
      // Удаляем прогресс (счёт остаётся для отображения)
      clearProgress();
      setGameState('gameOver');
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

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
        <h1 className="text-4xl font-bold mb-2">⚔️ Clash Royale Deck Manager</h1>
        <p className="text-lg mb-6 max-w-xl mx-auto text-gray-600 dark:text-gray-300">
          Управляйте аккаунтами, колодами, получайте рекомендации – и играйте в карточную дуэль!
        </p>

        <div className={`p-6 rounded-2xl shadow-xl ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
          <h2 className="text-2xl font-semibold mb-4">⚡ Карточная дуэль</h2>

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

          <div className="mb-4">
            <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Выберите аккаунт
            </label>
            <select
              value={selectedPlayer}
              onChange={(e) => setSelectedPlayer(e.target.value)}
              className={`mt-1 w-full rounded px-3 py-2 ${isDark ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-900'} border`}
            >
              {players.map((p) => (
                <option key={p.id} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-3 justify-center">
            <button
              onClick={startNewGame}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              🆕
            </button>
            {gameSaved && !isGameOver && (
              <>
                <button
                  onClick={continueGame}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  ▶️
                </button>
                <button
                  onClick={endGame}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  🏁
                </button>
              </>
            )}
            <button
              onClick={() => setShowRecord(!showRecord)}
              className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
            >
              🏆
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
        <div className="grid grid-cols-3 gap-4 mb-4">
          {playerCards.map((cardId, index) => {
            const isSelected = selectedIndex === index;
            let cardClass = 'p-2 rounded-xl cursor-pointer transition-all duration-200 border-2 ';
            if (isSelected) {
              if (gameState === 'result') {
                cardClass += 'border-emerald-700 ring-2 ring-emerald-700';
              } else {
                cardClass += 'border-green-500 ring-2 ring-green-400';
              }
            } else {
              cardClass += 'border-gray-300 dark:border-gray-600 hover:border-blue-400';
            }
            return (
              <motion.div
                key={cardId}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={cardClass}
                onClick={() => handleChoice(cardId, index)}
              >
                <CardIcon cardId={cardId} className="w-16 h-16 mx-auto" />
                <p className="text-xs mt-1 truncate">{cardTranslations[cardId] || cardId}</p>
              </motion.div>
            );
          })}
        </div>

        {/* Карта соперника (показывается в playing и result) */}
        <AnimatePresence>
          {(gameState === 'playing' || gameState === 'result') && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
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
        </AnimatePresence>

        {/* Обратный отсчёт */}
        {gameState === 'countdown' && (
          <motion.div
            key="countdown"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            className="text-6xl font-bold my-4"
          >
            {countdown}
          </motion.div>
        )}

        {/* Результат */}
        {gameState === 'result' && result && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4"
          >
            {result === 'win' && <p className="text-2xl text-green-500">🎉 Победа!</p>}
            {result === 'lose' && <p className="text-2xl text-red-500">😵 Поражение!</p>}
            {result === 'draw' && <p className="text-2xl text-yellow-500">🤝 Ничья!</p>}
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {result === 'win' && `${cardTranslations[finalChoice || ''] || '???'} побеждает ${cardTranslations[opponentCard] || '???'}`}
              {result === 'lose' && `${cardTranslations[opponentCard] || '???'} побеждает ${cardTranslations[finalChoice || ''] || '???'}`}
              {result === 'draw' && `${cardTranslations[finalChoice || ''] || '???'} vs ${cardTranslations[opponentCard] || '???'} – одинаково`}
            </p>

            {showButtons && (
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
          </motion.div>
        )}
      </div>
    </div>
  );
}

// ---------- Основной компонент App ----------
function AppContent() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
      isActive
        ? isDark
          ? 'bg-gray-700 text-white'
          : 'bg-blue-100 text-blue-700'
        : isDark
        ? 'text-gray-300 hover:bg-gray-700 hover:text-white'
        : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'
    }`;

  return (
    <div className={`min-h-screen transition-colors duration-300 ${
      isDark
        ? 'bg-gray-900 text-gray-100'
        : 'bg-gradient-to-br from-blue-50 to-purple-100 text-gray-900'
    }`}>
      <nav className={`shadow-md p-4 transition-colors duration-300 ${
        isDark ? 'bg-gray-800' : 'bg-white'
      }`}>
        <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-2 justify-center">
          <NavLink to="/" className={navLinkClass}>Главная</NavLink>
          <NavLink to="/players" className={navLinkClass}>Аккаунты</NavLink>
          <NavLink to="/player-stats" className={navLinkClass}>Статистика игрока</NavLink>
          <NavLink to="/decks" className={navLinkClass}>Мета-колоды</NavLink>
          <NavLink to="/recommend" className={navLinkClass}>Подбор</NavLink>
          <NavLink to="/clanwar" className={navLinkClass}>Clan Wars</NavLink>
          <NavLink to="/my-decks" className={navLinkClass}>Мои колоды</NavLink>
          <NavLink to="/diagnose" className={navLinkClass}>Диагноз</NavLink>
          <button
            onClick={toggleTheme}
            className={`ml-auto p-2 rounded-full transition-colors duration-200 ${
              isDark
                ? 'bg-gray-700 hover:bg-gray-600 text-yellow-400'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
            }`}
            aria-label="Переключить тему"
          >
            {isDark ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
          </button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto p-4">
        <Routes>
          <Route path="/" element={<Home theme={theme} />} />
          <Route path="/players" element={<PlayerList />} />
          <Route path="/player-stats" element={<PlayerStats />} />
          <Route path="/players/new" element={<PlayerForm />} />
          <Route path="/players/edit/:name" element={<PlayerForm />} />
          <Route path="/decks" element={<DeckList />} />
          <Route path="/decks/new" element={<DeckBuilder />} />
          <Route path="/decks/edit/:id" element={<DeckBuilder />} />
          <Route path="/recommend" element={<Recommend />} />
          <Route path="/clanwar" element={<ClanWarRecommend />} />
          <Route path="/my-decks" element={<SavedDecks />} />
          <Route path="/diagnose" element={<Diagnose />} />
        </Routes>
      </div>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <Router>
        <AppContent />
      </Router>
    </ThemeProvider>
  );
}

export default App;
