import React, { FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowPathIcon, MagnifyingGlassIcon, TrophyIcon, UserIcon } from '@heroicons/react/24/outline';
import { AxiosError } from 'axios';
import { ClashRoyalePlayerStats, getClashRoyalePlayerStats } from '../api';
import { useTheme } from '../context/ThemeContext';

const getRequestError = (error: unknown): string => {
  if (error instanceof AxiosError) {
    const status = error.response?.status;
    const message = (error.response?.data as { error?: string } | undefined)?.error;

    if (status === 503) return 'Статистика временно недоступна: API-токен не настроен на сервере.';
    if (status === 404) return 'Игрок с таким тегом не найден. Проверьте тег и попробуйте ещё раз.';
    if (status === 400) return message || 'Проверьте формат Player Tag.';
    if (!error.response) return 'Не удалось связаться с сервером. Проверьте подключение и попробуйте снова.';
    return message || 'Не удалось загрузить статистику игрока. Попробуйте позже.';
  }

  return 'Произошла непредвиденная ошибка при загрузке статистики.';
};

const StatTile: React.FC<{
  label: string;
  value: string;
  accent?: string;
  isDark: boolean;
}> = ({ label, value, accent, isDark }) => (
  <div className={`rounded-xl p-4 ${isDark ? 'bg-gray-700/70' : 'bg-gray-50'}`}>
    <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{label}</p>
    <p className={`mt-1 text-xl font-bold ${accent || (isDark ? 'text-gray-100' : 'text-gray-900')}`}>
      {value}
    </p>
  </div>
);

const PlayerStats: React.FC = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [searchParams] = useSearchParams();
  const tagParam = searchParams.get('tag') || '';
  const [tag, setTag] = useState('');
  const [player, setPlayer] = useState<ClashRoyalePlayerStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadPlayer = async (playerTag: string) => {
    const normalizedTag = playerTag.trim();
    if (!normalizedTag) {
      setError('Введите Player Tag, например #P890...');
      setPlayer(null);
      return;
    }

    setLoading(true);
    setError('');
    setPlayer(null);
    try {
      const result = await getClashRoyalePlayerStats(normalizedTag);
      setPlayer(result);
    } catch (requestError) {
      setError(getRequestError(requestError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!tagParam) return;
    setTag(tagParam);
    void loadPlayer(tagParam);
  }, [tagParam]);

  const searchPlayer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await loadPlayer(tag);
  };

  const winRate = player && player.battleCount > 0
    ? (player.wins / player.battleCount) * 100
    : 0;

  return (
    <section className="mx-auto max-w-3xl space-y-6 py-6">
      <header className="text-center">
        <div className={`mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl ${
          isDark ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-100 text-blue-700'
        }`}>
          <TrophyIcon className="h-7 w-7" />
        </div>
        <h1 className={`text-3xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
          Статистика Clash Royale
        </h1>
        <p className={`mt-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          Введите тег игрока, чтобы посмотреть его профиль и боевые показатели.
        </p>
      </header>

      <form
        onSubmit={searchPlayer}
        className={`flex flex-col gap-3 rounded-2xl p-5 shadow-lg sm:flex-row ${
          isDark ? 'bg-gray-800' : 'bg-white'
        }`}
      >
        <label htmlFor="player-tag" className="sr-only">Player Tag</label>
        <input
          id="player-tag"
          type="text"
          value={tag}
          onChange={event => setTag(event.target.value)}
          placeholder="#P890..."
          autoComplete="off"
          aria-describedby={error ? 'player-tag-error' : undefined}
          className={`min-w-0 flex-1 rounded-xl border px-4 py-3 outline-none transition focus:ring-2 ${
            isDark
              ? 'border-gray-600 bg-gray-700 text-gray-100 placeholder-gray-400 focus:border-blue-400 focus:ring-blue-400/30'
              : 'border-gray-300 bg-white text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-blue-500/20'
          }`}
        />
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading
            ? <ArrowPathIcon className="h-5 w-5 animate-spin" />
            : <MagnifyingGlassIcon className="h-5 w-5" />}
          {loading ? 'Загрузка…' : 'Найти'}
        </button>
      </form>

      {error && (
        <div
          id="player-tag-error"
          role="alert"
          className={`rounded-xl border px-4 py-3 ${
            isDark
              ? 'border-red-900 bg-red-950/50 text-red-300'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {error}
        </div>
      )}

      {player && (
        <article className={`overflow-hidden rounded-2xl shadow-xl ${
          isDark ? 'bg-gray-800' : 'bg-white'
        }`}>
          <div className="bg-gradient-to-r from-blue-700 to-indigo-600 p-6 text-white sm:p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15">
                <UserIcon className="h-8 w-8" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-2xl font-bold sm:text-3xl">{player.name}</h2>
                <p className="mt-1 font-mono text-sm text-blue-100">{player.tag}</p>
                {player.clan && (
                  <p className="mt-2 text-sm text-blue-100">
                    {player.clan.name} <span className="font-mono">({player.clan.tag})</span>
                  </p>
                )}
              </div>
              <div className="shrink-0 rounded-xl bg-white/15 px-3 py-2 text-center">
                <p className="text-xs text-blue-100">Уровень</p>
                <p className="text-xl font-bold">{player.expLevel}</p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-blue-100">
              <p>Арена: <span className="font-semibold text-white">{player.arena?.name || 'Не указана'}</span></p>
              <p>Лучший результат: <span className="font-semibold text-white">{player.bestTrophies.toLocaleString()}</span></p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4 sm:p-6">
            <StatTile label="Трофеи" value={player.trophies.toLocaleString()} accent="text-amber-500" isDark={isDark} />
            <StatTile label="Победы" value={player.wins.toLocaleString()} accent="text-green-500" isDark={isDark} />
            <StatTile label="Поражения" value={player.losses.toLocaleString()} accent="text-red-500" isDark={isDark} />
            <StatTile label="Процент побед" value={`${winRate.toFixed(1)}%`} accent="text-blue-500" isDark={isDark} />
          </div>
          <p className={`px-5 pb-5 text-sm sm:px-6 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            Всего боёв: {player.battleCount.toLocaleString()}
          </p>
        </article>
      )}
    </section>
  );
};

export default PlayerStats;
