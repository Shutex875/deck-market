import { useEffect, useState } from 'react';
import { getUpgradeBudget, type BudgetDeck, type BudgetRecommendation } from '../api';
import { useActivePlayer } from '../context/ActivePlayer';
import { getCardById } from '../data/cards';
import { CardIcon } from '../utils/cardImages';
import PlayerResourceLink from './PlayerResourceLink';
import UpgradeCopyCoverage from './UpgradeCopyCoverage';

const sections = [
  { key: 'ready', title: 'Готова к игре', empty: 'Нет колоды со всеми открытыми картами и нужными формами.' },
  { key: 'affordable', title: 'В пределах бюджета', empty: 'Нет колоды, которую можно довести до цели за указанные запасы.' },
  { key: 'prospective', title: 'Перспективная', empty: 'Колоды с дефицитом не найдены.' },
] as const;
const rarities: Record<string, string> = {
  Common: 'обычные', Rare: 'редкие', Epic: 'эпические', Legendary: 'легендарные', Champion: 'чемпионы',
};
const format = (value: number) => value.toLocaleString('ru-RU');
const cardName = (id: string) => getCardById(id)?.name ?? id;

function BudgetDeckDetails({ deck, ready }: { deck: BudgetDeck; ready: boolean }) {
  const upgrades = deck.details.filter(card => card.steps.length);
  const hasDeficit = deck.goldDeficit || deck.shardDeficit || deck.heroCoinDeficit || deck.uncoveredCopies;
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{deck.name}</h3>
        <span className="text-xs text-slate-600 dark:text-gray-300">
          {ready ? 'Текущая оценка' : 'Оценка после прокачки'} · {format(ready ? deck.currentScore : deck.projectedScore)}
        </span>
      </div>
      <div className="my-3 grid grid-cols-8 gap-1">
        {deck.cards.map(card => <CardIcon key={card} cardId={card} className="w-full object-contain" />)}
      </div>
      <p className="text-sm">
        До цели · {format(deck.totalGold)} золота
      </p>
      <UpgradeCopyCoverage {...deck} />
      {!hasDeficit && !deck.missingData.length && <p className="text-sm text-green-700 dark:text-green-300">План покрыт известными ресурсами.</p>}
      {hasDeficit ? (
        <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-medium">Что нужно до цели</p>
          <ul>
            {deck.goldDeficit > 0 && <li>Золото · {format(deck.goldDeficit)}</li>}
            {Object.entries(deck.uncoveredCopiesByRarity).filter(([, count]) => count > 0).map(([rarity, count]) => (
              <li key={rarity}>Не покрыто джокерами ({rarities[rarity] ?? rarity}) · {format(count)}</li>
            ))}
            {deck.shardDeficit > 0 && <li>Осколки · {deck.shardDeficit}</li>}
            {deck.heroCoinDeficit > 0 && <li>Монеты героя · {deck.heroCoinDeficit}</li>}
          </ul>
        </div>
      ) : null}
      {deck.missingData.length > 0 && <p className="mt-3 text-sm">Для проверки укажите {deck.missingData.join('; ')}.</p>}
      <details className="mt-3 border-t border-slate-200 pt-2 text-sm dark:border-gray-700">
        <summary className="cursor-pointer font-medium">Шаги и особые формы</summary>
        {!upgrades.length && <p className="mt-2">Уровни карт уже достигнуты.</p>}
        <ul className="mt-2 space-y-2">
          {upgrades.map(card => (
            <li key={card.card}>
              <strong>{cardName(card.card)}</strong>
              <ol className="ml-5 list-decimal">
                {card.steps.map((step, index) => (
                  <li key={step.level}>
                    {index === 0 && card.currentLevel === 0 ? 'Открыть' : 'Повысить'} до ур. {step.level} ·
                    {' '}{format(step.gold)} золота · {format(step.copies)} копий
                  </li>
                ))}
              </ol>
            </li>
          ))}
          {deck.forms.map(form => (
            <li key={form.card}>
              <strong>{form.type === 'evolution' ? 'Эволюция' : 'Герой'} · {cardName(form.card)}</strong>
              {' — '}{form.unlocked ? 'открыта' : form.type === 'hero' ? `${form.heroCoins} монет героя`
                : `${form.specificShards} своих + ${form.universalShards} универсальных осколков${form.missingShards ? ` · не хватает ${form.missingShards}` : ''}`}
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}

export default function BudgetPlan() {
  const { activePlayer } = useActivePlayer();
  const [targetLevel, setTargetLevel] = useState(16);
  const [result, setResult] = useState<BudgetRecommendation>();
  const [error, setError] = useState('');
  const playerName = activePlayer?.name;

  useEffect(() => {
    if (!playerName) return;
    const request = new AbortController();
    setResult(undefined);
    setError('');
    void getUpgradeBudget(playerName, targetLevel, request.signal).then(data => {
      if (!request.signal.aborted) setResult(data);
    }).catch(() => {
      if (!request.signal.aborted) setError('Не удалось рассчитать план по бюджету.');
    });
    return () => request.abort();
  }, [playerName, targetLevel, activePlayer?.resources]);

  if (!activePlayer) return <p>Выберите игровой аккаунт.</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 shadow dark:bg-gray-800">
        <PlayerResourceLink player={activePlayer} />
        <label className="flex items-center gap-2 text-sm">
          Целевой уровень
          <select value={targetLevel} onChange={event => setTargetLevel(Number(event.target.value))}
            className="rounded-lg border p-2 dark:border-gray-700 dark:bg-gray-900">
            {Array.from({ length: 16 }, (_, index) => index + 1).map(level => <option key={level}>{level}</option>)}
          </select>
        </label>
      </div>
      <p className="text-sm text-slate-600 dark:text-gray-300">
        Сила колоды оценивается по уровням карт и бонусам особых слотов.
      </p>
      {error ? <p role="alert">{error}</p> : !result ? <p role="status">Считаем варианты…</p> : (
        <div className="grid items-start gap-4 lg:grid-cols-3">
          {sections.map(({ key, title, empty }) => {
            const deck = result[key];
            return (
              <section key={key} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                <h2 className="mb-2 text-sm font-semibold text-blue-700 dark:text-blue-300">{title}</h2>
                {deck ? <BudgetDeckDetails deck={deck} ready={key === 'ready'} /> : <p className="text-sm">{empty}</p>}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
