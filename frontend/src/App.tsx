import React, { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, Navigate, Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { SunIcon, MoonIcon, RectangleStackIcon, BookmarkSquareIcon } from '@heroicons/react/24/outline';
import NavigationMenu from './components/NavigationMenu';
import AuthGate from './components/AuthGate';
import type { UserSession } from './api/session';
import { getPlayers, type Player } from './api';
import { ActivePlayerContext } from './context/ActivePlayer';

const Home = lazy(() => import('./components/Home'));
const PlayerList = lazy(() => import('./components/PlayerList'));
const PlayerForm = lazy(() => import('./components/PlayerForm'));
const DeckList = lazy(() => import('./components/DeckList'));
const DeckBuilder = lazy(() => import('./components/DeckBuilder'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const Recommend = lazy(() => import('./components/Recommend'));
const ClanWarRecommend = lazy(() => import('./components/ClanWarRecommend'));
const Diagnose = lazy(() => import('./components/Diagnose'));
const UpgradePlan = lazy(() => import('./components/UpgradePlan'));
const SavedDecks = lazy(() => import('./components/SavedDecks'));
const PlayerStats = lazy(() => import('./components/PlayerStats'));
const UserProfile = lazy(() => import('./components/UserProfile'));

// ---------- Основной компонент App ----------
function AppContent({ user, logout, updateUser }: {
  user: UserSession;
  logout: () => Promise<void>;
  updateUser: (user: UserSession) => void;
}) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const [logoutError, setLogoutError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  const storageKey = `bastdecks.activePlayer.${user.id}`;
  const [preferredId, setPreferredId] = useState(() => localStorage.getItem(storageKey));
  const requestedName = new URLSearchParams(location.search).get('player');
  const collectionPlayer = location.pathname.startsWith('/players/edit/')
    ? players.find(player => location.pathname === `/players/edit/${encodeURIComponent(player.name)}`)
    : undefined;
  const activePlayer = collectionPlayer ?? players.find(player => player.name === requestedName)
    ?? players.find(player => player.id === preferredId) ?? players[0];

  useEffect(() => {
    let current = true;
    const load = () => {
      void getPlayers(true).then(data => {
        if (current) setPlayers(data);
      }).catch(console.error).finally(() => {
        if (current) setProfilesLoading(false);
      });
    };
    load();
    window.addEventListener('focus', load);
    window.addEventListener('bastdecks:players-changed', load);
    return () => {
      current = false;
      window.removeEventListener('focus', load);
      window.removeEventListener('bastdecks:players-changed', load);
    };
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!activePlayer) return;
    setPreferredId(activePlayer.id);
    localStorage.setItem(storageKey, activePlayer.id);
  }, [activePlayer?.id, storageKey]);

  const changeActivePlayer = (id: string) => {
    const player = players.find(item => item.id === id);
    if (!player) return;
    setPreferredId(id);
    if (location.pathname.startsWith('/players/edit/')) {
      navigate(`/players/edit/${encodeURIComponent(player.name)}`);
      return;
    }
    const query = new URLSearchParams(location.search);
    query.delete('player');
    if (location.pathname === '/upgrade-plan' || location.pathname === '/diagnose') {
      query.delete('deckId');
      query.delete('metaDeckId');
    }
    navigate({ search: query.toString() }, { replace: true });
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    setLogoutError('');
    try {
      await logout();
    } catch {
      setLogoutError('Не удалось выйти. Попробуйте ещё раз.');
      setLoggingOut(false);
    }
  };

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
    <ActivePlayerContext.Provider value={{ players, activePlayer }}>
    <div className={`min-h-screen transition-colors duration-300 ${
      isDark
        ? 'bg-gray-900 text-gray-100'
        : 'bg-slate-50 text-slate-900'
    }`}>
      <header className="border-b border-slate-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link to="/" aria-label="BastDecks · Главная" className="flex items-center gap-2 font-bold tracking-tight">
            <BookmarkSquareIcon aria-hidden="true" className="h-7 w-7 rounded-lg bg-blue-700 p-1 text-white" />
            BastDecks
          </Link>
          <nav aria-label="Основная навигация" className="order-last flex w-full flex-wrap items-center gap-1 border-t border-slate-100 pt-2 dark:border-gray-700 lg:order-none lg:w-auto lg:border-0 lg:pt-0">
            <NavLink to="/decks" className={navLinkClass}>Мета-колоды</NavLink>
            <NavigationMenu key={location.key + '-decks'} label="Подбор">
              <NavLink to="/recommend" className={navLinkClass}>Подбор под аккаунт</NavLink>
              <NavLink to="/clanwar" className={navLinkClass}>Клановые войны</NavLink>
              <NavLink to="/my-decks" className={navLinkClass}>Мои колоды</NavLink>
            </NavigationMenu>
            <NavLink to="/upgrade-plan" className={navLinkClass}>Прокачка</NavLink>
            <NavLink to="/more" className={navLinkClass}>Ещё</NavLink>
          </nav>
          <div className="ml-auto flex max-w-full flex-wrap items-center gap-1">
            {activePlayer ? (
              <div className="flex max-w-full items-center rounded-lg border border-slate-200 bg-slate-50 text-sm dark:border-gray-700 dark:bg-gray-900">
                {players.length > 1 && (
                  <select aria-label="Игровой аккаунт" className="max-w-32 rounded-l-lg bg-transparent py-1.5 pl-2 dark:bg-gray-900"
                    value={activePlayer.id} onChange={event => changeActivePlayer(event.target.value)}>
                    {players.map(player => <option key={player.id} value={player.id}>{player.name}</option>)}
                  </select>
                )}
                <Link className="inline-flex max-w-40 items-center gap-1 rounded-lg px-2 py-1.5 hover:text-blue-700 dark:hover:text-blue-300"
                  title="Коллекция активного аккаунта" aria-label="Коллекция активного аккаунта"
                  to={`/players/edit/${encodeURIComponent(activePlayer.name)}`}>
                  <RectangleStackIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
                  {players.length === 1 && <span className="truncate">{activePlayer.name}</span>}
                </Link>
              </div>
            ) : !profilesLoading && <Link to="/players/new" className="px-2 text-sm text-blue-700 dark:text-blue-300">Добавить аккаунт</Link>}
            <NavigationMenu key={location.key + '-profile'} align="right" label={<span className="max-w-24 truncate">{user.username}</span>}>
              <NavLink to="/profile" className={navLinkClass}>Настройки профиля</NavLink>
              <NavLink to="/players" className={navLinkClass}>Игровые аккаунты</NavLink>
              <button type="button" onClick={toggleTheme} className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-gray-700">
                {isDark ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
                {isDark ? 'Светлая тема' : 'Тёмная тема'}
              </button>
              <button type="button" onClick={() => void handleLogout()} disabled={loggingOut}
                className="rounded-md px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-gray-700">
                Выйти
              </button>
            </NavigationMenu>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-4">
        {logoutError && <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">{logoutError}</p>}
        <Suspense fallback={<div className="py-12 text-center text-gray-500 dark:text-gray-400">Загрузка…</div>}>
          <Routes>
            <Route path="/" element={<DeckList key="latest" latest canManageCatalog={user.canManageCatalog} />} />
            <Route path="/more" element={<Link className="text-blue-700 underline dark:text-blue-300" to="/more/game">Мини-игра</Link>} />
            <Route path="/more/game" element={<Home theme={theme} />} />
            <Route path="/players" element={<PlayerList />} />
            <Route path="/player-stats" element={<PlayerStats />} />
            <Route path="/players/new" element={<PlayerForm />} />
            <Route path="/players/edit/:name" element={<PlayerForm key={location.pathname} />} />
            <Route path="/decks" element={<DeckList key="catalog" canManageCatalog={user.canManageCatalog} />} />
            <Route path="/admin" element={<Navigate to="/profile/admin" replace />} />
            <Route path="/decks/new" element={user.canManageCatalog ? <DeckBuilder /> : <Navigate to="/decks" replace />} />
            <Route path="/decks/edit/:id" element={user.canManageCatalog ? <DeckBuilder /> : <Navigate to="/decks" replace />} />
            <Route path="/recommend" element={<Recommend key={activePlayer?.id} />} />
            <Route path="/clanwar" element={<ClanWarRecommend key={activePlayer?.id} />} />
            <Route path="/my-decks" element={<SavedDecks key={activePlayer?.id} />} />
            <Route path="/diagnose" element={<Navigate to={`/upgrade-plan${location.search}`} replace />} />
            <Route path="/upgrade-plan" element={<UpgradePlan />}>
              <Route index element={<Diagnose key={`${activePlayer?.id}:${location.search}`} />} />
              <Route path="clan-war" element={<ClanWarRecommend key={activePlayer?.id} upgrade />} />
              {['budget', 'shared-cards'].map(path => (
                <Route key={path} path={path} element={<p>Эта вкладка пока недоступна.</p>} />
              ))}
            </Route>
            <Route path="/profile" element={
              <>
                {user.canManageCatalog && (
                  <nav aria-label="Настройки профиля" className="mb-4 flex flex-wrap gap-2">
                    <NavLink to="/profile" end className={navLinkClass}>Настройки профиля</NavLink>
                    <NavLink to="/profile/admin" className={navLinkClass}>Админ-панель</NavLink>
                  </nav>
                )}
                <Outlet />
              </>
            }>
              <Route index element={<UserProfile user={user} onUpdate={updateUser} />} />
              <Route path="admin" element={user.canManageCatalog ? <AdminPanel canChangeRoles={user.isOwner} /> : <Navigate to="/profile" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </div>
    </div>
    </ActivePlayerContext.Provider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <Router>
        <AuthGate>{(user, logout, updateUser) => (
          <AppContent key={user.id} user={user} logout={logout} updateUser={updateUser} />
        )}</AuthGate>
      </Router>
    </ThemeProvider>
  );
}

export default App;
