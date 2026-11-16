import { useEffect, useRef, type CSSProperties } from 'react';
import { useReducedMotion } from 'framer-motion';
import { CardIcon } from '../utils/cardImages';
import { cardTranslations } from '../utils/cardTranslations';
import { getBattleScene, type RoundOutcome } from '../utils/duelRound';
import './BattleScene.css';

const duration = 1750;
const cardName = (id: string) => cardTranslations[id] || id;
const resultLabels = { win: 'Победа', lose: 'Поражение', draw: 'Ничья' };

function cardEffect(card: string) {
  if (['Electro Wizard', 'Sparky'].includes(card)) return 'zap';
  if (['Arrows', 'Wizard', 'Magic Archer', 'Musketeer'].includes(card)) return 'projectile';
  if (['Horde', 'Skeleton Army', 'Bats', 'Minions'].includes(card)) return 'swarm';
  if (['PEKKA', 'Mega Knight', 'Mini PEKKA', 'Prince', 'Dark Prince'].includes(card)) return 'heavy';
  return 'basic';
}

function Actor({ card, side, animate }: { card: string; side: 'lead' | 'other'; animate: boolean }) {
  const units = animate && card === 'Minions' ? 3 : animate && card === 'Skeleton Army' ? 5 : 0;
  return (
    <div className={`duel-actor duel-actor--${side} duel-actor--${cardEffect(card)}`}>
      {units ? (
        <div className={`duel-squad duel-squad--${units === 3 ? 'minions' : 'skeletons'}`}>
          {Array.from({ length: units }, (_, index) => (
            <span key={index} className="duel-unit" style={{ '--unit': index } as CSSProperties}>
              <CardIcon cardId={units === 3 ? card : 'Skeleton'} className="duel-face" />
            </span>
          ))}
        </div>
      ) : <CardIcon cardId={card} className="duel-face" />}
    </div>
  );
}

function Effects({ scene }: { scene: string }) {
  return (
    <div className="duel-effects" aria-hidden="true">
      {(scene === 'ricochet' || scene === 'volley') && Array.from({ length: 6 }, (_, index) => (
        <i key={index} className="duel-arrow" style={{ '--particle': index } as CSSProperties} />
      ))}
      {scene === 'volley' && Array.from({ length: 3 }, (_, index) => (
        <i key={index} className="duel-puff" style={{ '--particle': index } as CSSProperties} />
      ))}
      {(scene === 'fireball' || scene === 'heavy-strike') && <i className="duel-fireball" />}
      {scene === 'fireball' && Array.from({ length: 9 }, (_, index) => (
        <i key={index} className="duel-bone" style={{ '--particle': index, '--angle': `${index * 40}deg` } as CSSProperties} />
      ))}
      {['dive', 'surround', 'heavy-strike'].includes(scene) && <i className="duel-slash" />}
      {scene === 'dive' && <i className="duel-dive-trail" />}
      <i className="duel-impact" />
    </div>
  );
}

export default function BattleScene({ player, computer, outcome, animating, onComplete }: {
  player: string;
  computer: string;
  outcome: RoundOutcome;
  animating: boolean;
  onComplete?: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const callback = useRef(onComplete);
  useEffect(() => { callback.current = onComplete; }, [onComplete]);
  useEffect(() => {
    if (!animating) return;
    const timer = window.setTimeout(() => callback.current?.(), reducedMotion ? 0 : duration);
    return () => window.clearTimeout(timer);
  }, [animating, reducedMotion]);

  const scene = getBattleScene(player, computer, outcome);
  const mirror = outcome === 'lose';
  const animate = animating && !reducedMotion;
  return (
    <figure className="duel-board mx-auto mb-4 max-w-md" aria-label={`Вы: ${cardName(player)}. Компьютер: ${cardName(computer)}.`}>
      <div className="mb-2 grid grid-cols-2 gap-2 text-xs sm:text-sm">
        <div><span className="block text-slate-500 dark:text-gray-400">Вы</span><strong>{cardName(player)}</strong></div>
        <div><span className="block text-slate-500 dark:text-gray-400">Компьютер</span><strong>{cardName(computer)}</strong></div>
      </div>
      <div className={`duel-stage duel-stage--${scene.id}${mirror ? ' duel-stage--mirrored' : ''}${animate ? ' duel-stage--animate' : ''}`}
        aria-hidden="true">
        <Actor card={mirror ? computer : player} side="lead" animate={animate && scene.id !== 'draw'} />
        <Actor card={mirror ? player : computer} side="other" animate={animate && scene.id !== 'draw'} />
        {animate && <Effects scene={scene.id} />}
      </div>
      <figcaption className="mt-2 text-sm">
        <strong className={`block text-lg ${outcome === 'win' ? 'text-green-700 dark:text-green-300'
          : outcome === 'lose' ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>
          {resultLabels[outcome]}
        </strong>
        {scene.description || `${cardName(mirror ? computer : player)} побеждает: ${cardName(mirror ? player : computer)}.`}
      </figcaption>
      {animate && <button type="button" onClick={onComplete}
        className="mt-2 rounded-lg border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-gray-600 dark:hover:bg-gray-700">
        Пропустить
      </button>}
    </figure>
  );
}
