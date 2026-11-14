import { useState } from 'react';
import { isAxiosError } from 'axios';
import { applyPlayerCollection, checkPlayerCollection, type Player } from '../api';

export default function CollectionSync({ player, refresh }: { player: Player; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const preview = player.collectionPreview;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (error) {
      setError(isAxiosError<{ error: string }>(error)
        ? error.response?.data.error || 'Не удалось обновить данные коллекции'
        : 'Не удалось обновить данные коллекции');
    } finally {
      await refresh();
      setBusy(false);
    }
  }

  if (!player.tag?.trim()) return null;

  return (
    <div className="mt-3 space-y-2 text-sm">
      <button type="button" disabled={busy} onClick={() => void run(() => checkPlayerCollection(player.id))}
        className="rounded bg-blue-700 px-2 py-1 text-white hover:bg-blue-800 disabled:opacity-60">
        {busy ? 'Подождите…' : 'Проверить обновления'}
      </button>
      <p className="text-xs text-gray-600 dark:text-gray-300">
        {player.collectionCheckedAt
          ? <>Последняя успешная проверка <time dateTime={player.collectionCheckedAt}>
              {new Date(player.collectionCheckedAt).toLocaleString()}
            </time></>
          : 'Успешных проверок пока нет'}
      </p>
      {error && <p role="alert" className="text-red-700 dark:text-red-300">{error}</p>}
      {preview ? (
        <details className="rounded border border-gray-300 p-2 dark:border-gray-600">
          <summary className="cursor-pointer font-medium">Доступны обновления</summary>
          {preview.partial && <p className="mt-2">API вернул только текущую колоду.</p>}
          <ul className="my-2 max-h-48 space-y-1 overflow-auto">
            {preview.levels.map(({ card, from, to }) => (
              <li key={card}>{card} · {from ? `ур. ${from} → ${to}` : `новая карта, ур. ${to}`}</li>
            ))}
            {preview.evolutions.map(card => <li key={`evo-${card}`}>{card} · эволюция</li>)}
            {preview.heroes.map(card => <li key={`hero-${card}`}>{card} · герой или чемпион</li>)}
          </ul>
          <button type="button" disabled={busy} onClick={() => void run(() => applyPlayerCollection(player.id, preview.id))}
            className="rounded bg-blue-700 px-2 py-1 text-white hover:bg-blue-800 disabled:opacity-60">
            Применить изменения
          </button>
        </details>
      ) : player.collectionCheckedAt && <p className="text-xs">Нет ожидающих изменений</p>}
    </div>
  );
}
