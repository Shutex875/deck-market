import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAdminOverview, type AdminOverview } from '../api';

const counters = [
  ['users', 'Пользователи'],
  ['players', 'Привязанные игровые аккаунты'],
  ['metaDecks', 'Мета-колоды'],
  ['savedDecks', 'Сохранённые колоды'],
] as const;
const dateFormat = new Intl.DateTimeFormat('ru', { dateStyle: 'medium' });
const control = 'rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-700';

export default function AdminPanel() {
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const request = new AbortController();
    setData(null);
    setError(false);
    getAdminOverview(page, request.signal).then(result => {
      if (request.signal.aborted) return;
      if (page > result.pageCount) setPage(result.pageCount);
      else setData(result);
    }, () => {
      if (!request.signal.aborted) setError(true);
    });
    return () => request.abort();
  }, [page, refresh]);

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Админ-панель</h1>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={control} onClick={() => setRefresh(value => value + 1)}>Обновить</button>
          <Link to="/decks" className={control}>Открыть каталог</Link>
          <Link to="/decks/new" className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">Добавить мета-колоду</Link>
        </div>
      </div>
      {error ? <p role="alert">Не удалось загрузить панель. Нажмите «Обновить».</p>
        : !data ? <p role="status">Загрузка…</p>
          : <>
            <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {counters.map(([key, label]) => (
                <div key={key} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                  <dt className="text-sm text-gray-600 dark:text-gray-300">{label}</dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums">{data.totals[key]}</dd>
                </div>
              ))}
            </dl>
            <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <h2 className="mb-3 text-lg font-semibold">Пользователи</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead><tr>
                    <th scope="col" className="p-2">Логин</th>
                    <th scope="col" className="p-2">Роль</th>
                    <th scope="col" className="p-2">Игровые аккаунты</th>
                    <th scope="col" className="p-2">Дата регистрации</th>
                  </tr></thead>
                  <tbody>
                    {data.accounts.map(account => (
                      <tr key={account.id} className="border-t border-gray-200 dark:border-gray-700">
                        <th scope="row" className="p-2 font-medium">{account.username}</th>
                        <td className="p-2">{account.isOwner ? 'Владелец каталога' : 'Пользователь'}</td>
                        <td className="p-2 tabular-nums">{account.profiles}</td>
                        <td className="p-2"><time dateTime={account.createdAt}>{dateFormat.format(new Date(account.createdAt))}</time></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.pageCount > 1 && (
                <nav aria-label="Страницы списка пользователей" className="mt-4 flex flex-wrap items-center gap-3">
                  <button type="button" className={control} disabled={page === 1} onClick={() => setPage(page - 1)}>Назад</button>
                  <span>Страница {page} из {data.pageCount}</span>
                  <button type="button" className={control} disabled={page === data.pageCount} onClick={() => setPage(page + 1)}>Дальше</button>
                </nav>
              )}
            </section>
          </>}
    </main>
  );
}
