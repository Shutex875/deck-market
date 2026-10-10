// Приоритеты эволюций (чем меньше число, тем выше приоритет)
export const evoPriorities: Record<string, number> = {
  // S

  // A
  'Valkyrie': 1,
  'Exe': 2,
  'Mortar': 3,
  // B
  'Goblin Cage': 4,
  'Tesla': 5,
  'Lumberjack': 6,
  'BabyD': 7,
  'Inferno Dragon': 8,
  'Mega Knight': 9,
  'Ghost': 10,
  'Cannon': 11,
  'Zap': 12,
  'Royal Giant': 13,
  'Skarmy': 14,
  // B
  'SkellyBarrel': 15,
  'Royal Recruits': 16,
  'Royal Hogs': 17,
  'Snowball': 18,
  'Ram': 19,
  'Wall Breakers': 20,
  'Furnace': 21,
  'Firecracker': 22,
  'Horde': 23,
  // c
  'Archers': 24,
  'eDragon': 25,
  'Musketeer': 26,
  'Witch': 27,
  'Bats': 28,
  'Goblin Barrel': 29,
  'Hunter': 30,
  'PEKKA': 31,
  //D
  'Knight': 32,
  'Goblin Giant': 33,
  'Princess': 34,
  'Goblin Drill': 35,
  'Wizard': 36,
  'Skeletons': 37,
  'Dart Goblin': 38,
  'Barbarians': 39,
  'Ice Spirit': 40,
  'Bomber': 41,
};

// Приоритеты героев (чем меньше число, тем выше приоритет)
export const heroPriorities: Record<string, number> = {
  'Goblins': 1,
  'Balloon': 2,
  'Knight': 3,
  'Magic Archer': 4,
  'Mega Minion': 5,
  'Giant': 6,
  'Bowler': 7,
  'Ice Golem': 8,
  'Mini PEKKA': 9,
  'Dark Prince': 10,
  'Wizard': 11,
  'Barbarian Barrel': 12,
  'Musketeer': 13,
  'Tombstone': 14,
};

// Приоритеты чемпионов (фактически те же, что и герои, но отдельно)
export const championPriorities: Record<string, number> = {
  'Mighty Miner': 1,
  'Golden Knight': 2,
  'Archer Queen': 3,
  'Skeleton King': 4,
  'Monk': 5,
  'Boss Bandit': 6,
  'Goblinstein': 7,
  'Little Prince': 8,
};

// Функция для получения приоритета эволюции
export const getEvoPriority = (cardId: string): number => {
  return evoPriorities[cardId] ?? 999;
};

// Функция для получения приоритета героя
export const getHeroPriority = (cardId: string): number => {
  return heroPriorities[cardId] ?? 999;
};
