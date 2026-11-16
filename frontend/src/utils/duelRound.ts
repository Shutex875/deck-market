export const CYCLES = [
  ['Electro Wizard', 'Inferno Dragon', 'Mega Knight'],
  ['Skeleton Army', 'PEKKA', 'Wizard'],
  ['Electro Wizard', 'Sparky', 'PEKKA'],
  ['Arrows', 'Minions', 'Mini PEKKA'],
  ['Dark Prince', 'Guards', 'Ronin'],
  ['Prince', 'Magic Archer', 'Bats'],
  ['Lumberjack', 'Musketeer', 'Minions'],
];

export type RoundOutcome = 'win' | 'lose' | 'draw';

export function getRoundOutcome(cycle: string[], player: string, computer: string): RoundOutcome {
  if (player === computer) return 'draw';
  return cycle[(cycle.indexOf(computer) + 2) % 3] === player ? 'win' : 'lose';
}

const scenes = new Map([
  ['Mini PEKKA|Arrows', { id: 'ricochet', description: 'Стрелы отскакивают от брони. Мини-П.Е.К.К.А. идёт дальше.' }],
  ['Arrows|Minions', { id: 'volley', description: 'Залп перехватывает трёх миньонов в воздухе.' }],
  ['Minions|Mini PEKKA', { id: 'dive', description: 'Меч проходит под миньонами. Они атакуют сверху.' }],
  ['Wizard|Skeleton Army', { id: 'fireball', description: 'Огненный шар попадает в толпу скелетов.' }],
  ['Skeleton Army|PEKKA', { id: 'surround', description: 'Первый скелет падает, остальные окружают П.Е.К.К.А.' }],
  ['PEKKA|Wizard', { id: 'heavy-strike', description: 'П.Е.К.К.А. выдерживает огненный шар и отвечает тяжёлым ударом.' }],
]);

export function getBattleScene(player: string, computer: string, outcome: RoundOutcome) {
  if (outcome === 'draw') return { id: 'draw', description: 'Обе карты встречаются в центре арены.' };
  const [winner, loser] = outcome === 'win' ? [player, computer] : [computer, player];
  return scenes.get(`${winner}|${loser}`) ?? { id: 'generic', description: '' };
}
