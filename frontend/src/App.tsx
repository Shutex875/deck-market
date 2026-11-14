import React, { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, Navigate, Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline';
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
    if (location.pathname === '/upgrade-plan' || location.pathname === '/diagnose') query.delete('deckId');
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
        : 'bg-gradient-to-br from-blue-50 to-purple-100 text-gray-900'
    }`}>
      <nav className={`shadow-md p-4 transition-colors duration-300 ${
        isDark ? 'bg-gray-800' : 'bg-white'
      }`}>
        <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-2 justify-center">
          <NavLink to="/" className={navLinkClass}>Главная</NavLink>
          <NavLink to="/players" className={navLinkClass}>Аккаунты</NavLink>
          <NavLink to="/decks" className={navLinkClass}>Мета-колоды</NavLink>
          <NavLink to="/upgrade-plan" className={navLinkClass}>План прокачки</NavLink>
          <NavLink to="/more" className={navLinkClass}>Ещё</NavLink>
          {activePlayer ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {players.length > 1 ? (
                <label className="flex items-center gap-2">
                  Аккаунт
                  <select className="rounded border bg-white px-2 py-1 dark:border-gray-600 dark:bg-gray-700"
                    value={activePlayer.id} onChange={event => changeActivePlayer(event.target.value)}>
                    {players.map(player => <option key={player.id} value={player.id}>{player.name}</option>)}
                  </select>
                </label>
              ) : <span>Аккаунт <strong>{activePlayer.name}</strong></span>}
              <Link className="text-blue-700 underline dark:text-blue-300"
                to={`/players/edit/${encodeURIComponent(activePlayer.name)}`}>Коллекция</Link>
            </div>
          ) : !profilesLoading && <Link to="/players/new" className="text-sm underline">Добавить аккаунт</Link>}
          <NavLink to="/profile" title="Настройки профиля" className={state => `ml-auto ${navLinkClass(state)}`}>
            {user.username}
          </NavLink>
          <button type="button" onClick={() => void handleLogout()} disabled={loggingOut}
            className="rounded-md px-3 py-2 text-sm underline disabled:opacity-50">
            Выйти
          </button>
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-full transition-colors duration-200 ${
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
              {['budget', 'clan-war', 'shared-cards'].map(path => (
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
