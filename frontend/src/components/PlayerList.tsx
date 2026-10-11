import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  UserIcon,
  ChartBarIcon,
  SparklesIcon,
  UserGroupIcon,
  PencilIcon,
  TrashIcon,
  BookmarkIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline';
import { getPlayers, deletePlayer, Player } from '../api';
import { useTheme } from '../context/ThemeContext';
import { isHeroUpgradeId } from '../utils/clashRoyaleAccountSync';

const PlayerList: React.FC = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterEvo, setFilterEvo] = useState(false);
  const [filterHero, setFilterHero] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'avgLevel' | 'cardCount'>('name');

  const fetchPlayers = async () => {
    try {
      const data = await getPlayers();
      setPlayers(data);
      setLoading(false);
    } catch (err) {
      setError('Не удалось загрузить аккаунты');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlayers();
  }, []);

  const handleDelete = async (name: string) => {
    if (!confirm(`Удалить аккаунт "${name}"?`)) return;
    try {
      await deletePlayer(name);
      await fetchPlayers();
    } catch (err) {
      alert('Ошибка при удалении');
    }
  };

  const getPlayerStats = (player: Player) => {
    const levels = JSON.parse(player.levels);
    const evolutions = JSON.parse(player.evolutions);
    const heroes = JSON.parse(player.heroes);
    const cardCount = Object.keys(levels).length;
    const totalLevel = Object.values(levels).reduce((sum: number, lv: any) => sum + Number(lv), 0);
    const avgLevel = cardCount > 0 ? totalLevel / cardCount : 0;
    const heroCount = heroes.filter(isHeroUpgradeId).length;
    return { cardCount, avgLevel, evolutions: evolutions.length, heroCount };
  };

  const filteredPlayers = players.filter(player => {
    const nameMatch = player.name.toLowerCase().includes(searchTerm.toLowerCase());
    if (!nameMatch) return false;
    const stats = getPlayerStats(player);
    if (filterEvo && stats.evolutions === 0) return false;
    if (filterHero && stats.heroCount === 0) return false;
    return true;
  });

  const sortedPlayers = [...filteredPlayers].sort((a, b) => {
    const statsA = getPlayerStats(a);
    const statsB = getPlayerStats(b);
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'avgLevel') return statsB.avgLevel - statsA.avgLevel;
    if (sortBy === 'cardCount') return statsB.cardCount - statsA.cardCount;
    return 0;
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return <div className={`text-center py-8 ${isDark ? 'text-red-400' : 'text-red-500'}`}>{error}</div>;
  }

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center mb-4 gap-2">
        <h2 className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>Аккаунты</h2>
        <Link
          to="/players/new"
          className={`flex items-center gap-1 px-4 py-2 rounded transition-colors duration-200 ${
            isDark
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          <PlusIcon className="w-4 h-4" />
          Добавить аккаунт
        </Link>
      </div>

      <div
        className={`p-3 rounded-lg shadow mb-4 flex flex-wrap items-center gap-3 transition-colors duration-200 ${
          isDark ? 'bg-gray-800' : 'bg-white'
        }`}
      >
        <div className="relative flex-1 min-w-[150px]">
          <MagnifyingGlassIcon className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${
            isDark ? 'text-gray-400' : 'text-gray-500'
          }`} />
          <input
            type="text"
            placeholder="Поиск по имени..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full pl-9 pr-3 py-1 text-sm rounded border transition-colors duration-200 ${
              isDark
                ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-400 focus:border-blue-400'
                : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500'
            } focus:outline-none`}
          />
        </div>

        <label className={`flex items-center gap-1 text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
          <input
            type="checkbox"
            checked={filterEvo}
            onChange={() => setFilterEvo(!filterEvo)}
            className="accent-blue-500"
          />
          Есть эво
        </label>
        <label className={`flex items-center gap-1 text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
          <input
            type="checkbox"
            checked={filterHero}
            onChange={() => setFilterHero(!filterHero)}
            className="accent-blue-500"
          />
          Есть герои
        </label>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className={`border rounded px-3 py-1 text-sm transition-colors duration-200 ${
            isDark
              ? 'bg-gray-700 border-gray-600 text-gray-200'
              : 'bg-white border-gray-300 text-gray-900'
          } focus:outline-none`}
        >
          <option value="name">Сортировать по имени</option>
          <option value="avgLevel">Сортировать по среднему уровню</option>
          <option value="cardCount">Сортировать по количеству карт</option>
        </select>
      </div>

      {sortedPlayers.length === 0 ? (
        <p className={`text-center py-8 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          Нет аккаунтов, соответствующих фильтрам
        </p>
      ) : (
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
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
        >
          {sortedPlayers.map((player) => {
            const stats = getPlayerStats(player);
            return (
              <motion.div
                key={player.id}
                variants={{
                  hidden: { opacity: 0, y: 20, scale: 0.95 },
                  visible: { opacity: 1, y: 0, scale: 1 },
                }}
                whileHover={{ scale: 1.02, boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className={`rounded-lg shadow p-3 border-l-4 border-blue-500 flex flex-col transition-colors duration-200 ${
                  isDark ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-gray-50'
                }`}
              >
                <div className="flex justify-between items-start">
                  <h3 className={`font-bold text-lg truncate ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                    {player.name}
                  </h3>
                  <div className="flex gap-1 text-sm">
                    <Link
                      to={`/players/edit/${encodeURIComponent(player.name)}`}
                      className={`p-1 rounded transition-colors ${
                        isDark
                          ? 'text-blue-400 hover:bg-gray-600'
                          : 'text-blue-600 hover:bg-blue-50'
                      }`}
                    >
                      <PencilIcon className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={() => handleDelete(player.name)}
                      className={`p-1 rounded transition-colors ${
                        isDark
                          ? 'text-red-400 hover:bg-gray-600'
                          : 'text-red-600 hover:bg-red-50'
                      }`}
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className={`flex items-center gap-2 text-sm mt-1 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                  <UserIcon className="w-4 h-4" />
                  <span>Карт: {stats.cardCount}</span>
                  <ChartBarIcon className="w-4 h-4 ml-1" />
                  <span>Ср.ур.: {stats.avgLevel.toFixed(1)}</span>
                </div>

                <div className={`flex flex-wrap gap-3 text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  <span className="flex items-center gap-1">
                    <SparklesIcon className="w-3 h-3" />
                    Эво: {stats.evolutions}
                  </span>
                  <span className="flex items-center gap-1">
                    <UserGroupIcon className="w-3 h-3" />
                    Герои: {stats.heroCount}
                  </span>
                </div>

                <div className={`mt-3 flex flex-wrap gap-2 border-t pt-3 ${
                  isDark ? 'border-gray-700' : 'border-gray-200'
                }`}>
                  {player.tag?.trim() && (
                    <Link
                      to={`/player-stats?tag=${encodeURIComponent(player.tag.trim())}`}
                      title="Статистика Clash Royale"
                      className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs ${
                        isDark ? 'bg-gray-700 text-blue-300 hover:bg-gray-600' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                      }`}
                    >
                      <ChartBarIcon className="h-4 w-4" />
                      Статистика
                    </Link>
                  )}
                  <Link
                    to={`/recommend?player=${encodeURIComponent(player.name)}`}
                    title="Подбор колод"
                    className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs ${
                      isDark ? 'bg-gray-700 text-purple-300 hover:bg-gray-600' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                    }`}
                  >
                    <SparklesIcon className="h-4 w-4" />
                    Подбор
                  </Link>
                  <Link
                    to={`/my-decks?player=${encodeURIComponent(player.name)}`}
                    title="Мои колоды"
                    className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs ${
                      isDark ? 'bg-gray-700 text-amber-300 hover:bg-gray-600' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                    }`}
                  >
                    <BookmarkIcon className="h-4 w-4" />
                    Мои колоды
                  </Link>
                  <Link
                    to={`/clanwar?player=${encodeURIComponent(player.name)}`}
                    title="Подбор для Clan Wars"
                    className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs ${
                      isDark ? 'bg-gray-700 text-green-300 hover:bg-gray-600' : 'bg-green-50 text-green-700 hover:bg-green-100'
                    }`}
                  >
                    <WrenchScrewdriverIcon className="h-4 w-4" />
                    Clan Wars
                  </Link>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
};

export default PlayerList;
