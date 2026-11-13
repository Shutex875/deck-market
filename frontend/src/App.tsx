import React, { lazy, Suspense, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline';
import AuthGate from './components/AuthGate';
import type { UserSession } from './api/session';

const Home = lazy(() => import('./components/Home'));
const PlayerList = lazy(() => import('./components/PlayerList'));
const PlayerForm = lazy(() => import('./components/PlayerForm'));
const DeckList = lazy(() => import('./components/DeckList'));
const DeckBuilder = lazy(() => import('./components/DeckBuilder'));
const Recommend = lazy(() => import('./components/Recommend'));
const ClanWarRecommend = lazy(() => import('./components/ClanWarRecommend'));
const Diagnose = lazy(() => import('./components/Diagnose'));
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
            <Route path="/profile" element={<UserProfile user={user} onUpdate={updateUser} />} />
          </Routes>
        </Suspense>
      </div>
    </div>
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
