import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { checkDeckDuplicates, type DeckDuplicateInput, type DeckDuplicateResult, type DeckMatch } from '../api';
import { cardTranslations } from '../utils/cardTranslations';

const labels = {
  exact: 'Такая колода уже существует',
  'special-slots': 'Тот же состав, другие специальные слоты',
  similar: 'Похожая колода',
};

export function deckMatchLink(match: DeckMatch) {
  const params = new URLSearchParams({ deck: match.id });
  if (match.playerName) params.set('player', match.playerName);
  return `${match.location === 'meta' ? '/decks' : '/my-decks'}?${params}`;
}

export function useDeckMatches(draft: DeckDuplicateInput) {
  const { cards } = draft;
  const complete = cards.length === 8 && cards.every(Boolean) && new Set(cards).size === 8;
  const query = complete ? JSON.stringify(draft) : '';
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; data: DeckDuplicateResult | null }>();
  const key = `${attempt}:${query}`;

  useEffect(() => {
    if (!query) {
      setResult(undefined);
      return;
    }
    const request = new AbortController();
    const timer = window.setTimeout(() => {
      checkDeckDuplicates(JSON.parse(query), request.signal)
        .then(data => { if (!request.signal.aborted) setResult({ key, data }); })
        .catch(() => { if (!request.signal.aborted) setResult({ key, data: null }); });
    }, 150);
    return () => {
      window.clearTimeout(timer);
      request.abort();
    };
  }, [query, key]);

  const current = result?.key === key ? result : undefined;
  return {
    complete,
    checking: complete && !current,
    failed: current?.data === null,
    matches: current?.data?.matches ?? [],
    suggestedStats: current?.data?.suggestedStats,
    retry: () => setAttempt(value => value + 1),
  };
}

export default function DeckMatches({ check, matches = check.matches, onOpen }: {
  check: ReturnType<typeof useDeckMatches>;
  matches?: DeckMatch[];
  onOpen?: () => void;
}) {
  if (check.checking) return <p role="status" className="my-3 text-sm">Проверяем совпадения…</p>;
  if (check.failed) return (
    <div role="alert" className="my-3 text-sm">
      Не удалось проверить совпадения.{' '}
      <button type="button" className="underline" onClick={check.retry}>Повторить проверку</button>
    </div>
  );
  if (!matches.length) return null;
  return (
    <ul aria-label="Совпадения колоды" className="my-3 max-h-56 divide-y divide-gray-300 overflow-auto rounded-lg border border-gray-300 text-sm dark:divide-gray-700 dark:border-gray-700">
      {matches.map(match => (
        <li key={`${match.location}:${match.id}`} className="flex items-start justify-between gap-3 p-3">
          <div className="min-w-0 break-words">
            <p className="font-semibold">{labels[match.kind]}</p>
            <p>{match.name} · {match.location === 'meta' ? 'Мета-каталог' : `Мои колоды · ${match.playerName}`}</p>
            {match.kind === 'similar' && (
              <p>В черновике {cardTranslations[match.draftCard] ?? match.draftCard}, в найденной колоде {cardTranslations[match.existingCard] ?? match.existingCard}.</p>
            )}
          </div>
          <Link className="shrink-0 underline" to={deckMatchLink(match)} onClick={onOpen}>Открыть</Link>
        </li>
      ))}
    </ul>
  );
}
