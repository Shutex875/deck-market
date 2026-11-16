import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { getSharedCardUpgrades, type SharedCardPriority, type SharedCardUpgrade } from '../api';
import { useActivePlayer } from '../context/ActivePlayer';
import { CardIcon } from '../utils/cardImages';
import { getCardById } from '../data/cards';
import PlayerResourceLink from './PlayerResourceLink';
import UpgradeCopyCoverage from './UpgradeCopyCoverage';

const cardName = (id: string) => getCardById(id)?.name ?? id;
const number = (value: number) => value.toLocaleString('ru-RU');
const fieldClass = 'rounded-lg border bg-white px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900';

function DeckGroup<Deck extends { id: string; name: string }>({ title, decks, detail, player, targetLevel }: {
  title: string; decks: Deck[]; detail?: (deck: Deck) => ReactNode; player: string; targetLevel: number;
}) {
  if (!decks.length) return null;
  return (
    <div>
      <h3 className="font-medium">{title}</h3>
      <ul className="mt-1 space-y-1">
        {decks.map(deck => (
          <li key={deck.id}>
            <Link className="text-blue-700 underline dark:text-blue-300" to={`/upgrade-plan?${new URLSearchParams({
              player, targetLevel: String(targetLevel), metaDeckId: deck.id,
            })}`}>{deck.name}</Link>
            {detail && <> · {detail(deck)}</>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function UpgradeOption({ step, player, targetLevel }: { step: SharedCardUpgrade; player: string; targetLevel: number }) {
  const deckLink = { player, targetLevel };
  const highlighted = new Set([...step.oneCardLeft, ...step.withinBudget].map(deck => deck.id));
  const otherDecks = step.closer.filter(deck => !highlighted.has(deck.id));
  return (
    <details className="rounded-xl border border-slate-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <summary className="cursor-pointer p-3 sm:p-4">
        <span className="inline-flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-3 gap-y-1 align-middle">
          <CardIcon cardId={step.card} className="w-8" />
          <strong>{cardName(step.card)} · {step.fromLevel} → {step.toLevel}</strong>
          {step.reached.length > 0 && <span className="text-sm">Достигнут цели: {step.reached.length}</span>}
          {step.oneCardLeft.length > 0 && <span className="text-sm">Останется одна карта: {step.oneCardLeft.length}</span>}
          {step.withinBudget.length > 0 && <span className="text-sm">Довести за остаток: {step.withinBudget.length}</span>}
          {!step.reached.length && !step.oneCardLeft.length && !step.withinBudget.length && (
            <span className="text-sm">Ближе к цели: {step.closer.length}</span>
          )}
          <span className={`text-xs font-medium ${step.affordable
            ? 'text-green-700 dark:text-green-300' : 'text-amber-800 dark:text-amber-300'}`}>
            {step.affordable ? 'Можно улучшить' : step.needsInput.length ? 'Уточните запасы' : 'Нужно накопить'}
          </span>
        </span>
      </summary>
      <div className="space-y-3 border-t border-slate-200 p-4 text-sm dark:border-gray-700">
        <p><strong>Стоимость шага</strong> · {number(step.gold)} золота</p>
        <UpgradeCopyCoverage neededCopies={step.copies} wildcardsCovered={step.wildcardsUsed} uncoveredCopies={step.uncoveredCopies} />
        {step.missingGold > 0 && <p>Не хватает золота: {number(step.missingGold)}</p>}
        {step.needsInput.length > 0 && <p>Для проверки укажите {step.needsInput.join(', ')}.</p>}
        <DeckGroup title="Достигнут цели" decks={step.reached} {...deckLink} />
        <DeckGroup title="Останется одна карта" decks={step.oneCardLeft} {...deckLink} detail={deck =>
          `${cardName(deck.card)} · ${deck.level ? `ур. ${deck.level}` : 'не открыта'}`} />
        <DeckGroup title="Можно довести за остаток бюджета" decks={step.withinBudget} {...deckLink}
          detail={deck => `ещё ${number(deck.gold)} золота`} />
        {otherDecks.length > 0 && (
          <details>
            <summary className="cursor-pointer font-medium">Другие колоды, которые приблизятся к цели</summary>
            <DeckGroup title="Оставшиеся шаги" decks={otherDecks} {...deckLink}
              detail={deck => `шагов: ${deck.remainingSteps}`} />
          </details>
        )}
      </div>
    </details>
  );
}

export default function SharedCardsPlan() {
  const { activePlayer } = useActivePlayer();
  const [targetLevel, setTargetLevel] = useState(16);
  const [priority, setPriority] = useState<SharedCardPriority>('budget');
  const [steps, setSteps] = useState<SharedCardUpgrade[]>();
  const [failed, setFailed] = useState(false);
  const playerId = activePlayer?.id;

  useEffect(() => {
    if (!playerId) return;
    const request = new AbortController();
    setSteps(undefined);
    setFailed(false);
    void getSharedCardUpgrades(playerId, targetLevel, priority, request.signal).then(data => {
      if (!request.signal.aborted) setSteps(data);
    }).catch(() => {
      if (!request.signal.aborted) setFailed(true);
    });
    return () => request.abort();
  }, [playerId, targetLevel, priority, activePlayer?.resources, activePlayer?.levels]);

  if (!activePlayer) return <p>Выберите игровой аккаунт.</p>;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 rounded-xl bg-white p-4 shadow dark:bg-gray-800">
        <PlayerResourceLink player={activePlayer} />
        <label className="flex items-center gap-2 text-sm">
          Целевой уровень
          <select className={fieldClass} value={targetLevel} onChange={event => setTargetLevel(Number(event.target.value))}>
            {Array.from({ length: 16 }, (_, index) => index + 1).map(level => <option key={level}>{level}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          Приоритет
          <select className={fieldClass} value={priority}
            onChange={event => setPriority(event.target.value === 'target' ? 'target' : 'budget')}>
            <option value="budget">Больше вариантов по бюджету</option>
            <option value="target">Больше колод достигнут цели</option>
          </select>
        </label>
      </div>
      <p className="text-sm text-slate-600 dark:text-gray-300">Каждый шаг проверяется отдельно. Остаток бюджета рассчитан для каждой колоды по отдельности.</p>
      {failed ? <p role="alert">Не удалось сравнить улучшения.</p> : !steps
        ? <p role="status">Сравниваем улучшения…</p> : steps.length ? (
          steps.map(step => <UpgradeOption key={step.card} step={step} player={activePlayer.name} targetLevel={targetLevel} />)
        ) : <p>Для этой цели нет подходящих улучшений на один уровень.</p>}
    </section>
  );
}
