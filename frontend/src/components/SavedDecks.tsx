import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserIcon,
  MagnifyingGlassIcon,
  BookmarkIcon,
  ChartBarIcon,
  TrashIcon,
  CalendarIcon,
} from '@heroicons/react/24/outline';
import { getPlayers, getPlayer, Player, getSavedDecks, deleteSavedDeck, SavedDeck } from '../api';
import { CardIcon } from '../utils/cardImages';
import { ALL_CARDS_DATA } from '../data/cards';
import { useTheme } from '../context/ThemeContext';

const SavedDecks: React.FC = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const navigate = useNavigate();

  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState('');
  const [decks, setDecks] = useState<SavedDeck[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [playerEvolutions, setPlayerEvolutions] = useState<string[]>([]);
  const [playerHeroes, setPlayerHeroes] = useState<string[]>([]);

  useEffect(() => {
    const fetchPlayers = async () => {
      try {
        const data = await getPlayers();
        setPlayers(data);
        if (data.length > 0) {
          const first = data[0].name;
          setSelectedPlayer(first);
          await loadPlayerData(first);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchPlayers();
  }, []);

  useEffect(() => {
    if (selectedPlayer) {
      loadPlayerData(selectedPlayer);
      fetchDecks();
    }
  }, [selectedPlayer]);

  const loadPlayerData = async (playerName: string) => {
    try {
      const player = await getPlayer(playerName);
      setPlayerEvolutions(JSON.parse(player.evolutions));
      setPlayerHeroes(JSON.parse(player.heroes));
    } catch (err) {
      console.error('Ошибка загрузки данных игрока', err);
    }
  };

  const fetchDecks = async () => {
    if (!selectedPlayer) return;
    setLoading(true);
    setError('');
    try {
      const data = await getSavedDecks(selectedPlayer);
      setDecks(data);
    } catch (err) {
      setError('Не удалось загрузить сохранённые колоды');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить колоду?')) return;
    try {
      await deleteSavedDeck(id);
      await fetchDecks();
    } catch (err) {
      alert('Ошибка удаления');
    }
  };

  const handleDiagnose = (deckId: string) => {
    navigate(`/diagnose?deckId=${deckId}&player=${encodeURIComponent(selectedPlayer)}`);
  };

  // Функции для отображения специальных слотов с учётом данных игрока
  const getCustomSrc = (cardId: string, slotIndex: number) => {
    const card = ALL_CARDS_DATA.find(c => c.id === cardId);
    if (!card) return undefined;

    // Проверяем, есть ли у игрока эта эволюция/герой
    const hasEvo = playerEvolutions.includes(cardId);
    const hasHero = playerHeroes.includes(cardId);

    if (slotIndex === 0 && card.evoFile && hasEvo) {
      return `/cards/Evo/${card.evoFile}.webp`;
    }
    if (slotIndex === 1 && card.heroFile && hasHero) {
      return `/cards/Hero/${card.heroFile}.webp`;
    }
    if (slotIndex === 2) {
      // Для слота 2: если есть эво и игрок имеет эво, показываем эво; иначе если есть герой и игрок имеет герой, показываем герой; иначе обычная
      if (card.evoFile && hasEvo) {
        return `/cards/Evo/${card.evoFile}.webp`;
      }
      if (card.heroFile && hasHero) {
        return `/cards/Hero/${card.heroFile}.webp`;
      }
    }
    return undefined;
  };

  const getSlotBorderClass = (slotIndex: number, cardId?: string) => {
    const card = cardId ? ALL_CARDS_DATA.find(c => c.id === cardId) : null;
    const hasEvo = cardId ? playerEvolutions.includes(cardId) : false;
    const hasHero = cardId ? playerHeroes.includes(cardId) : false;

    if (slotIndex === 0) {
      return hasEvo ? 'border-purple-500 border-4' : 'border-gray-300 border-2';
    }
    if (slotIndex === 1) {
      return hasHero ? 'border-yellow-500 border-4' : 'border-gray-300 border-2';
    }
    if (slotIndex === 2) {
      if (hasEvo) return 'border-purple-500 border-4';
      if (hasHero) return 'border-yellow-500 border-4';
      return 'border-gray-300 border-2';
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
    <div className={`max-w-7xl mx-auto transition-colors duration-200 ${
      isDark ? 'text-gray-200' : 'text-gray-900'
    }`}>
      <h2 className="text-2xl font-bold mb-4">Мои колоды</h2>

      <div className={`p-4 rounded-lg shadow mb-6 transition-colors duration-200 ${
        isDark ? 'bg-gray-800' : 'bg-white'
      }`}>
        <label className={`block font-medium mb-1 ${
          isDark ? 'text-gray-300' : 'text-gray-700'
        }`}>Аккаунт</label>
        <select
          value={selectedPlayer}
          onChange={(e) => setSelectedPlayer(e.target.value)}
          className={`w-full rounded px-3 py-2 max-w-xs transition-colors duration-200 ${
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

      {error && <div className={`mb-4 p-3 rounded-lg ${
        isDark ? 'bg-red-900/50 text-red-300' : 'bg-red-100 text-red-600'
      }`}>{error}</div>}

      <AnimatePresence mode="wait">
        {decks.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`text-center py-8 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}
          >
            <BookmarkIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Нет сохранённых колод. Перейдите в «Подбор колоды» и сохраните понравившуюся.</p>
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
            {decks.map(deck => {
              const cards = JSON.parse(deck.cards);
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
                    <h3 className={`font-bold text-lg truncate ${
                      isDark ? 'text-gray-200' : 'text-gray-800'
                    }`}>{deck.name}</h3>
                    <div className="flex gap-2 text-sm">
                      <button
                        onClick={() => handleDiagnose(deck.id)}
                        className={`flex items-center gap-1 transition-colors ${
                          isDark
                            ? 'text-blue-400 hover:text-blue-300'
                            : 'text-blue-600 hover:text-blue-800'
                        }`}
                      >
                        <ChartBarIcon className="w-4 h-4" />
                        Диагноз
                      </button>
                      <button
                        onClick={() => handleDelete(deck.id)}
                        className={`flex items-center gap-1 transition-colors ${
                          isDark
                            ? 'text-red-400 hover:text-red-300'
                            : 'text-red-600 hover:text-red-800'
                        }`}
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-1 mt-2">
                    {cards.map((cardId: string, idx: number) => {
                      const borderClass = getSlotBorderClass(idx, cardId);
                      const customSrc = getCustomSrc(cardId, idx);
                      return (
                        <div key={idx} className={`relative rounded bg-gray-50 dark:bg-gray-700 p-1 flex flex-col items-center ${borderClass}`}>
                          <CardIcon cardId={cardId} className="w-12 h-12 mx-auto" customSrc={customSrc} />
                        </div>
                      );
                    })}
                  </div>

                  <div className={`flex items-center gap-1 text-xs mt-2 ${
                    isDark ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    <CalendarIcon className="w-3 h-3" />
                    Сохранено: {new Date(deck.createdAt).toLocaleDateString()}
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SavedDecks;
