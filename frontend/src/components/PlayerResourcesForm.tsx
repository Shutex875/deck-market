import { useEffect, useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { TrashIcon } from '@heroicons/react/24/outline';
import { getPlayerResources, savePlayerResources, type PlayerResources } from '../api';
import { getEvoCards } from '../data/cards';

const rarityLabels = {
  Common: 'Обычные', Rare: 'Редкие', Epic: 'Эпические', Legendary: 'Легендарные', Champion: 'Чемпионы',
} as const;
const rarities = Object.keys(rarityLabels) as (keyof typeof rarityLabels)[];
const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-gray-600 dark:bg-gray-900';

function Amount({ label, value, onChange }: { label: string; value: number; onChange: (amount: number) => void }) {
  return (
    <label className="grid gap-1 text-sm">
      {label}
      <input className={inputClass} type="number" min={0} max={2147483647} step={1} value={value}
        onChange={event => {
          const amount = event.target.valueAsNumber;
          onChange(Number.isFinite(amount) ? Math.min(2147483647, Math.max(0, Math.trunc(amount))) : 0);
        }} />
    </label>
  );
}

function CardAmounts({ title, cards, values, onChange }: {
  title: string; cards: { id: string; name: string }[]; values: Record<string, number>;
  onChange: (values: Record<string, number>) => void;
}) {
  const hasAmount = (id: string) => Object.prototype.hasOwnProperty.call(values, id);
  const entries = Object.entries(values);
  const zeroCount = entries.filter(([, amount]) => amount === 0).length;

  function removeCard(id: string) {
    const remaining = { ...values };
    delete remaining[id];
    onChange(remaining);
  }

  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 font-semibold">{title}</legend>
      <select className={inputClass} aria-label={`Добавить позицию — ${title}`} value=""
        onChange={event => {
          if (event.target.value) onChange({ ...values, [event.target.value]: 0 });
        }}>
        <option value="">Выбрать карту…</option>
        {cards.filter(card => !hasAmount(card.id)).map(card => (
          <option key={card.id} value={card.id}>{card.name}</option>
        ))}
      </select>
      {zeroCount > 0 && (
        <button type="button"
          className="rounded-md px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-gray-300 dark:hover:bg-gray-700"
          onClick={() => onChange(Object.fromEntries(entries.filter(([, amount]) => amount !== 0)))}>
          Убрать нулевые ({zeroCount})
        </button>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.filter(card => hasAmount(card.id)).map(card => (
          <div key={card.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-1">
            <Amount label={card.name} value={values[card.id]}
              onChange={amount => onChange({ ...values, [card.id]: amount })} />
            <button type="button" aria-label={`Убрать «${card.name}» — ${title.toLowerCase()}`} title="Убрать строку"
              onClick={() => removeCard(card.id)}
              className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700 dark:text-gray-400 dark:hover:bg-red-950 dark:hover:text-red-300">
              <TrashIcon aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

export default function PlayerResourcesForm({ id, name, tag }: { id: string; name: string; tag: string }) {
  const [resources, setResources] = useState<PlayerResources>();
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const request = new AbortController();
    void getPlayerResources(id, request.signal).then(data => {
      if (!request.signal.aborted) setResources(data);
    }).catch(() => {
      if (!request.signal.aborted) setError('Не удалось загрузить ресурсы аккаунта');
    });
    return () => request.abort();
  }, [id]);

  function update(patch: Partial<PlayerResources>) {
    setResources(current => current && { ...current, ...patch });
    setSaved(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resources || saving) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      setResources(await savePlayerResources(id, resources));
      setSaved(true);
    } catch (error) {
      setError(isAxiosError<{ error: string }>(error) && error.response?.data.error || 'Не удалось сохранить ресурсы');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-5 rounded-xl bg-white p-4 shadow dark:bg-gray-800 sm:p-6" onSubmit={submit}>
      <p><strong>{name}</strong> · {tag || 'Тег не указан'}</p>
      {error && <p role="alert" className="text-red-700 dark:text-red-300">{error}</p>}
      {resources ? (
        <>
          <fieldset disabled={saving} className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <Amount label="Золото" value={resources.gold} onChange={gold => update({ gold })} />
              <Amount label="Универсальные осколки" value={resources.universalShards} onChange={universalShards => update({ universalShards })} />
              <Amount label="Монеты героя" value={resources.heroCoins} onChange={heroCoins => update({ heroCoins })} />
            </div>
            <fieldset>
              <legend className="mb-2 font-semibold">Джокеры</legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {rarities.map(rarity => (
                  <Amount key={rarity} label={rarityLabels[rarity]} value={resources.wildcards[rarity]}
                    onChange={count => update({ wildcards: { ...resources.wildcards, [rarity]: count } })} />
                ))}
              </div>
            </fieldset>
            <CardAmounts title="Осколки эволюций" cards={getEvoCards()} values={resources.evolutionShards}
              onChange={evolutionShards => update({ evolutionShards })} />
          </fieldset>
          <button disabled={saving} className="rounded-lg bg-blue-700 px-4 py-2 font-medium text-white disabled:opacity-50">
            {saving ? 'Сохраняю…' : 'Сохранить ресурсы'}
          </button>
          {saved && <p role="status">Ресурсы сохранены</p>}
        </>
      ) : !error && <p role="status">Загрузка ресурсов…</p>}
    </form>
  );
}
