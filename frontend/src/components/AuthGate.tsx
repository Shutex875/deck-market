import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import PasswordInput from './PasswordInput';
import { authenticate, getSession, onSessionExpired, SessionRequestError, signOut, type UserSession } from '../api/session';
import { useTheme } from '../context/ThemeContext';

function errorMessage(error: unknown, fallback: string) {
  return error instanceof SessionRequestError && error.message ? error.message : fallback;
}

export default function AuthGate({ children }: {
  children: (user: UserSession, logout: () => Promise<void>, updateUser: (user: UserSession) => void) => ReactNode;
}) {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const [user, setUser] = useState<UserSession | null | undefined>();
  const [retry, setRetry] = useState(0);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => onSessionExpired(() => {
    setUser(null);
    setMode('login');
    setError('Сессия завершилась. Войдите снова.');
  }), []);

  useEffect(() => {
    const request = new AbortController();
    getSession(request.signal).then(
      session => { if (!request.signal.aborted) setUser(session); },
      error => {
        if (request.signal.aborted) return;
        if (error instanceof SessionRequestError && error.status === 401) setUser(null);
        else setError('Не удалось проверить сессию.');
      },
    );
    return () => request.abort();
  }, [retry]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      setUser(await authenticate(mode, username, password));
      setPassword('');
    } catch (error) {
      setError(errorMessage(error, 'Не удалось связаться с сервером.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (user) return children(user, async () => {
    await signOut();
    setUser(null);
    setMode('login');
    setError('');
  }, setUser);

  const fieldClass = `w-full rounded-md border px-3 py-2 ${dark ? 'border-gray-600 bg-gray-900' : 'border-gray-300 bg-white'}`;
  return (
    <main className={`grid min-h-screen place-items-center p-4 ${dark ? 'bg-gray-900 text-gray-100' : 'bg-blue-50 text-gray-900'}`}>
      <section className={`w-full max-w-sm rounded-xl p-6 shadow-lg ${dark ? 'bg-gray-800' : 'bg-white'}`}>
        <h1 className="mb-5 text-2xl font-bold">BastDecks</h1>
        {error && <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
        {user === undefined ? (
          error ? <button type="button" className="underline" onClick={() => { setError(''); setRetry(value => value + 1); }}>Повторить</button>
            : <p>Проверка сессии…</p>
        ) : (
          <>
            <div className="mb-5 flex gap-2">
              {(['login', 'register'] as const).map(option => (
                <button key={option} type="button" disabled={submitting} aria-pressed={mode === option}
                  className={`rounded-md px-3 py-2 text-sm ${mode === option ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700'}`}
                  onClick={() => { setMode(option); setError(''); setPassword(''); }}>
                  {option === 'login' ? 'Вход' : 'Регистрация'}
                </button>
              ))}
            </div>
            <form onSubmit={submit} className="space-y-4">
              <label className="block space-y-1">
                <span>Логин</span>
                <input required autoComplete="username" maxLength={32} value={username}
                  onChange={event => setUsername(event.target.value)} className={fieldClass} />
              </label>
              <PasswordInput key={mode} label="Пароль" submitting={submitting} required
                minLength={mode === 'register' ? 8 : undefined} maxLength={128}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password}
                onChange={event => setPassword(event.target.value)} className={fieldClass} />
              <button type="submit" disabled={submitting}
                className="w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {mode === 'login' ? 'Войти' : 'Создать пользователя'}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
