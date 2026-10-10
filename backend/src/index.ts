import axios from 'axios';
import * as cheerio from 'cheerio';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { evoPriorities, heroPriorities, championPriorities } from './priorities';

dotenv.config();

const prisma = new PrismaClient();
const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// ===== Данные о картах (скопированы из фронтенда для бэкенда) =====
// В идеале вынести в общий shared, но пока дублируем
type CardData = {
  id: string;
  name: string;
  rarity: string;
  file: string;
  evoFile?: string;
  heroFile?: string;
  champion?: boolean;
};

const ALL_CARDS_DATA: CardData[] = [
  // ===== Common =====
  // ===== Common =====
  { id: 'Skeleton', name: 'Скелет', rarity: 'Common', file: 'Skellies', evoFile: 'Skellies' },
  { id: 'Fire Spirit', name: 'Огненный дух', rarity: 'Common', file: 'FireSpirit' },
  { id: 'Ice Spirit', name: 'Ледяной дух', rarity: 'Common', file: 'IceSpirit', evoFile: 'IceSpirit' },
  { id: 'Electro Spirit', name: 'Электрический дух', rarity: 'Common', file: 'ElectroSpirit' },
  { id: 'Bats', name: 'Летучие мыши', rarity: 'Common', file: 'Bats', evoFile: 'Bats' },
  { id: 'Bomber', name: 'Подрывник', rarity: 'Common', file: 'Bomber', evoFile: 'Bomber' },
  { id: 'Berserker', name: 'Берсеркша', rarity: 'Common', file: 'Berserker' },
  { id: 'Zap', name: 'Разряд', rarity: 'Common', file: 'Zap', evoFile: 'Zap' },
  { id: 'Giant Snowball', name: 'Гигантский снежок', rarity: 'Common', file: 'Snowball', evoFile: 'Snowball' },
  { id: 'Goblins', name: 'Гоблины', rarity: 'Common', file: 'Gobs', heroFile: 'Gobs' },
  { id: 'Spear Goblins', name: 'Гоблины-копейщики', rarity: 'Common', file: 'SpearGobs' },
  { id: 'Goblin Gang', name: 'Банда гоблинов', rarity: 'Common', file: 'GobGang' },
  { id: 'Minions', name: 'Миньоны', rarity: 'Common', file: 'Minions' },
  { id: 'Archers', name: 'Лучницы', rarity: 'Common', file: 'Archers', evoFile: 'Archers' },
  { id: 'Arrows', name: 'Стрелы', rarity: 'Common', file: 'Arrows' },
  { id: 'Knight', name: 'Рыцарь', rarity: 'Common', file: 'Knight', evoFile: 'Knight', heroFile: 'Knight'},
  { id: 'Firecracker', name: 'Огненная лучница', rarity: 'Common', file: 'Firecracker', evoFile: 'Firecracker' },
  { id: 'Cannon', name: 'Пушка', rarity: 'Common', file: 'Cannon', evoFile: 'Cannon' },
  { id: 'RoyalDelivery', name: 'Королевская почта', rarity: 'Common', file: 'RoyalDelivery' },
  { id: 'Skeleton Barrel', name: 'Бочка со скелетами', rarity: 'Common', file: 'SkellyBarrel', evoFile: 'SkellyBarrel' },
  { id: 'Skeleton Dragons', name: 'Костяные драконы', rarity: 'Common', file: 'SkeletonDragons' },
  { id: 'Tesla', name: 'Тесла', rarity: 'Common', file: 'Tesla', evoFile: 'Tesla' },
  { id: 'Mortar', name: 'Мортира', rarity: 'Common', file: 'Mortar', evoFile: 'Mortar' },
  { id: 'Rascals', name: 'Разбойники', rarity: 'Common', file: 'Rascals' },
  { id: 'Barbarians', name: 'Варвары', rarity: 'Common', file: 'Barbs', evoFile: 'Barbs' },
  { id: 'Horde', name: 'Орда миньёнов', rarity: 'Common', file: 'Horde', evoFile: 'Horde' },
  { id: 'Elite Barbarians', name: 'Элитные варвары', rarity: 'Common', file: 'eBarbs' },
  { id: 'Royal Giant', name: 'Королевский гигант', rarity: 'Common', file: 'RG', evoFile: 'RG' },
  { id: 'Royal Recruits', name: 'Королевские рекруты', rarity: 'Common', file: 'RoyalRecruits', evoFile: 'RoyalRecruits' },


  // ===== Rare =====
  { id: 'Heal Spirit', name: 'Дух исцеления', rarity: 'Rare', file: 'HealSpirit' },
  { id: 'Suspicious Bush', name: 'Подозрительный куст', rarity: 'Rare', file: 'SuspiciousBush' },
  { id: 'Ice Golem', name: 'Ледяной голем', rarity: 'Rare', file: 'IceGolem', heroFile: 'IceGolem' },
  { id: 'Dart Goblin', name: 'Гоблин с дротиками', rarity: 'Rare', file: 'DartGob', evoFile: 'DartGob' },
  { id: 'Mega Minion', name: 'Мегаминьон', rarity: 'Rare', file: 'MM', heroFile: 'MM' },
  { id: 'Tombstone', name: 'Надгробие', rarity: 'Rare', file: 'Tombstone', heroFile: 'Tombstone' },
  { id: 'Elixir Golem', name: 'Эликсирный голем', rarity: 'Rare', file: 'ElixirGolem' },
  { id: 'Earthquake', name: 'Землетрясение', rarity: 'Rare', file: 'Earthquake' },
  { id: 'Mini PEKKA', name: 'Мини-П.Е.К.К.А', rarity: 'Rare', file: 'MP', heroFile: 'MP' },
  { id: 'Musketeer', name: 'Мушкетер', rarity: 'Rare', file: 'Musk', evoFile: 'Musk', heroFile: 'Musk' },
  { id: 'Valkyrie', name: 'Валькирия', rarity: 'Rare', file: 'Valk', evoFile: 'Valk' },
  { id: 'Battle Healer', name: 'Целительница-воин', rarity: 'Rare', file: 'BattleHealer' },
  { id: 'Battle Ram', name: 'Боевой таран', rarity: 'Rare', file: 'Ram', evoFile: 'Ram' },
  { id: 'Bomb Tower', name: 'Башня-бомбежка', rarity: 'Rare', file: 'BombTower' },
  { id: 'Goblin Demolisher', name: 'Гоблин-подрывник', rarity: 'Rare', file: 'GoblinDemolisher' },
  { id: 'Fireball', name: 'Огненный шар', rarity: 'Rare', file: 'Fireball' },
  { id: 'Goblin Cage', name: 'Клетка с гоблином', rarity: 'Rare', file: 'GoblinCage', evoFile: 'GoblinCage' },
  { id: 'Goblin Hut', name: 'Хижина гоблинов', rarity: 'Rare', file: 'GobHut' },
  { id: 'Zappies', name: 'Зэппи', rarity: 'Rare', file: 'Zappies' },
  { id: 'Hog Rider', name: 'Всадник на кабане', rarity: 'Rare', file: 'Hog' },
  { id: 'Flying Machine', name: 'Летучка', rarity: 'Rare', file: 'FlyingMachine' },
  { id: 'Furnace', name: 'Печь', rarity: 'Rare', file: 'Furnace', evoFile: 'Furnace' },
  { id: 'Wizard', name: 'Колдун', rarity: 'Rare', file: 'Wiz', evoFile: 'Wiz', heroFile: 'Wiz' },
  { id: 'Giant', name: 'Гигант', rarity: 'Rare', file: 'Giant', heroFile: 'Giant' },
  { id: 'Royal Hogs', name: 'Королевские кабаны', rarity: 'Rare', file: 'RoyalHogs', evoFile: 'RoyalHogs' },
  { id: 'Inferno Tower', name: 'Адская башня', rarity: 'Rare', file: 'Inferno' },
  { id: 'Barbarian Hut', name: 'Хижина варваров', rarity: 'Rare', file: 'BarbHut' },
  { id: 'Elixir Collector', name: 'Сборщик эликсира', rarity: 'Rare', file: 'Pump' },
  { id: 'Rocket', name: 'Ракета', rarity: 'Rare', file: 'Rocket' },
  { id: 'Three Musketeers', name: 'Три мушкетера', rarity: 'Rare', file: '3M' },

  // ===== Epic =====
  { id: 'Mirror', name: 'Зеркало', rarity: 'Epic', file: 'Mirror' },
  { id: 'Barbarian Barrel', name: 'Бочка с варварами', rarity: 'Epic', file: 'BarbBarrel', heroFile: 'BarbBarrel' },
  { id: 'Rage', name: 'Ярость', rarity: 'Epic', file: 'Rage' },
  { id: 'Goblin Curse', name: 'Проклятие гоблинов', rarity: 'Epic', file: 'GoblinCurse' },
  { id: 'Wall Breakers', name: 'Стенобои', rarity: 'Epic', file: 'WallBreakers', evoFile: 'WallBreakers' },
  { id: 'Goblin Barrel', name: 'Гоблинская бочка', rarity: 'Epic', file: 'Barrel', evoFile: 'Barrel' },
  { id: 'Tornado', name: 'Торнадо', rarity: 'Epic', file: 'Tornado' },
  { id: 'Vines', name: 'Лоза', rarity: 'Epic', file: 'Vines' },
  { id: 'Void', name: 'Бездна', rarity: 'Epic', file: 'Void' },
  { id: 'Clone', name: 'Клон', rarity: 'Epic', file: 'Clone' },
  { id: 'Guards', name: 'Стражи', rarity: 'Epic', file: 'Guards' },
  { id: 'Skeleton Army', name: 'Армия скелетов', rarity: 'Epic', file: 'Skarmy', evoFile: 'Skarmy' },
  { id: 'Freeze', name: 'Заморозка', rarity: 'Epic', file: 'Freeze' },
  { id: 'Poison', name: 'Яд', rarity: 'Epic', file: 'Poison' },
  { id: 'Goblin Drill', name: 'Гоблинский бур', rarity: 'Epic', file: 'GoblinDrill', evoFile: 'GoblinDrill' },
  { id: 'Dark Prince', name: 'Тёмный принц', rarity: 'Epic', file: 'DarkPrince', heroFile: 'DarkPrince' },
  { id: 'Hunter', name: 'Охотник', rarity: 'Epic', file: 'Hunter', evoFile: 'Hunter' },
  { id: 'Rune Giant', name: 'Руническая гигантша', rarity: 'Epic', file: 'RuneGiant' },
  { id: 'Baby Dragon', name: 'Дракончик', rarity: 'Epic', file: 'BabyD', evoFile: 'BabyD' },
  { id: 'Balloon', name: 'Шар', rarity: 'Epic', file: 'Balloon', heroFile: 'Balloon' },
  { id: 'Bowler', name: 'Вышибала', rarity: 'Epic', file: 'Bowler', heroFile: 'Bowler' },
  { id: 'Cannon Cart', name: 'Повозка с пушкой', rarity: 'Epic', file: 'CannonCart' },
  { id: 'Electro Dragon', name: 'Электродракон', rarity: 'Epic', file: 'eDragon', evoFile: 'eDragon' },
  { id: 'Executioner', name: 'Палач', rarity: 'Epic', file: 'Exe', evoFile: 'Exe' },
  { id: 'Prince', name: 'Принц', rarity: 'Epic', file: 'Prince' },
  { id: 'Witch', name: 'Ведьма', rarity: 'Epic', file: 'Witch', evoFile: 'Witch' },
  { id: 'Giant Skeleton', name: 'Гигантский скелет', rarity: 'Epic', file: 'GiantSkelly' },
  { id: 'Goblin Giant', name: 'Гоблин-гигант', rarity: 'Epic', file: 'GobGiant', evoFile: 'GobGiant' },
  { id: 'X-Bow', name: 'Арбалет', rarity: 'Epic', file: 'XBow' },
  { id: 'Lightning', name: 'Молния', rarity: 'Epic', file: 'Lightning' },
  { id: 'PEKKA', name: 'П.Е.К.К.А.', rarity: 'Epic', file: 'PEKKA', evoFile: 'PEKKA' },
  { id: 'Electro Giant', name: 'Электрогигант', rarity: 'Epic', file: 'ElectroGiant' },
  { id: 'Golem', name: 'Голем', rarity: 'Epic', file: 'Golem' },

  // ===== Legendary =====
  { id: 'The Log', name: 'Бревно', rarity: 'Legendary', file: 'Log' },
  { id: 'Miner', name: 'Шахтер', rarity: 'Legendary', file: 'Miner' },
  { id: 'Bandit', name: 'Бандитка', rarity: 'Legendary', file: 'Bandit' },
  { id: 'Fisherman', name: 'Рыбак', rarity: 'Legendary', file: 'Fisherman' },
  { id: 'Ice Wizard', name: 'Ледяной колдун', rarity: 'Legendary', file: 'IceWiz' },
  { id: 'Princess', name: 'Принцесса', rarity: 'Legendary', file: 'Princess', evoFile: 'Princess' },
  { id: 'Royal Ghost', name: 'Королевский призрак', rarity: 'Legendary', file: 'Ghost', evoFile: 'Ghost' },
  { id: 'Lumberjack', name: 'Дровосек', rarity: 'Legendary', file: 'Lumber', evoFile: 'Lumber' },
  { id: 'Magic Archer', name: 'Магический лучник', rarity: 'Legendary', file: 'MagicArcher', heroFile: 'MagicArcher' },
  { id: 'Electro Wizard', name: 'Громовержец', rarity: 'Legendary', file: 'eWiz' },
  { id: 'Inferno Dragon', name: 'Пламенный дракон', rarity: 'Legendary', file: 'InfernoD', evoFile: 'InfernoD' },
  { id: 'Mother Witch', name: 'Ведьмина бабушка', rarity: 'Legendary', file: 'MotherWitch' },
  { id: 'Night Witch', name: 'Ночная ведьма', rarity: 'Legendary', file: 'NightWitch' },
  { id: 'Phoenix', name: 'Феникс', rarity: 'Legendary', file: 'Phoenix' },
  { id: 'Ronin', name: 'Ронин', rarity: 'Legendary', file: 'Ronin' },
  { id: 'Goblin Machine', name: 'Гоблинская машина', rarity: 'Legendary', file: 'GoblinMachine' },
  { id: 'Ram Rider', name: 'Всадница на баране', rarity: 'Legendary', file: 'RamRider' },
  { id: 'Graveyard', name: 'Кладбище', rarity: 'Legendary', file: 'Graveyard' },
  { id: 'Spirit Empress', name: 'Императрица духов', rarity: 'Legendary', file: 'SpiritEmpress' },
  { id: 'Sparky', name: 'Спарки', rarity: 'Legendary', file: 'Sparky' },
  { id: 'Lava Hound', name: 'Адская гончая', rarity: 'Legendary', file: 'Lava' },
  { id: 'Mega Knight', name: 'Мегарыцарь', rarity: 'Legendary', file: 'MegaKnight', evoFile: 'MegaKnight' },



  // ===== Champion =====

  { id: 'Little Prince', name: 'Маленький принц', rarity: 'Champion', file: 'LittlePrince', champion: true },
  { id: 'Skeleton King', name: 'Король скелетов', rarity: 'Champion', file: 'SkeletonKing', champion: true },
  { id: 'Golden Knight', name: 'Золотой рыцарь', rarity: 'Champion', file: 'GoldenKnight', champion: true },
  { id: 'Mighty Miner', name: 'Шустрый шахтер', rarity: 'Champion', file: 'MightyMiner', champion: true },
  { id: 'Archer Queen', name: 'Королева лучниц', rarity: 'Champion', file: 'ArcherQueen', champion: true },
  { id: 'Goblinstein', name: 'Гоблинштейн', rarity: 'Champion', file: 'Goblinstein', champion: true },
  { id: 'Monk', name: 'Монах', rarity: 'Champion', file: 'Monk', champion: true },
  { id: 'Boss Bandit', name: 'Главная бандитка', rarity: 'Champion', file: 'BossBandit', champion: true },
];
const cardDataMap: Record<string, CardData> = {};
ALL_CARDS_DATA.forEach(c => cardDataMap[c.id] = c);

const ALL_CARDS = ALL_CARDS_DATA.map(c => c.id);

// ===== Функция исправления шаблона (Фаза 1) =====
const fixDeckTemplate = (cards: string[], slot2Type: string | null): { cards: string[]; slot2Type: string | null } => {
  const newCards = [...cards];
  let newSlot2Type = slot2Type;

  // Слот 0 — эво
  const card0 = cardDataMap[newCards[0]];
  if (!card0?.evoFile) {
    let bestEvoIndex = -1;
    let bestPriority = Infinity;
    for (let i = 2; i < 8; i++) {
      const card = cardDataMap[newCards[i]];
      if (card?.evoFile) {
        const priority = evoPriorities[newCards[i]] ?? 999;
        if (priority < bestPriority) {
          bestPriority = priority;
          bestEvoIndex = i;
        }
      }
    }
    if (bestEvoIndex !== -1) {
      [newCards[0], newCards[bestEvoIndex]] = [newCards[bestEvoIndex], newCards[0]];
    }
  }

  // Слот 1 — герой/чемпион (новый)
  const card1 = cardDataMap[newCards[1]];
  if (!card1?.heroFile && !card1?.champion) {
    let bestHeroIndex = -1;
    let bestPriority = Infinity;
    // ищем среди остальных слотов (0,2,3..7), но предпочтение отдаём не занятым
    for (let i = 0; i < 8; i++) {
      if (i === 1) continue; // сам слот
      const card = cardDataMap[newCards[i]];
      if (card?.heroFile || card?.champion) {
        let priority = 999;
        if (card.heroFile) priority = heroPriorities[newCards[i]] ?? 999;
        else if (card.champion) priority = championPriorities[newCards[i]] ?? 999;
        if (priority < bestPriority) {
          bestPriority = priority;
          bestHeroIndex = i;
        }
      }
    }
    if (bestHeroIndex !== -1) {
      [newCards[1], newCards[bestHeroIndex]] = [newCards[bestHeroIndex], newCards[1]];
    }
  }

  // Слот 2 — безумный (ранее был слот 1)
  const card2 = cardDataMap[newCards[2]];
  const hasSpecial = card2?.evoFile || card2?.heroFile || card2?.champion;
  if (!hasSpecial) {
    // ищем замену среди оставшихся слотов (3..7)
    let bestHeroIndex = -1;
    let bestPriority = Infinity;
    for (let i = 3; i < 8; i++) {
      const card = cardDataMap[newCards[i]];
      if (card?.heroFile) {
        const priority = heroPriorities[newCards[i]] ?? 999;
        if (priority < bestPriority) {
          bestPriority = priority;
          bestHeroIndex = i;
        }
      }
    }
    if (bestHeroIndex !== -1) {
      [newCards[2], newCards[bestHeroIndex]] = [newCards[bestHeroIndex], newCards[2]];
      newSlot2Type = 'hero';
    } else {
      let bestEvoIndex = -1;
      let bestPriority = Infinity;
      for (let i = 3; i < 8; i++) {
        const card = cardDataMap[newCards[i]];
        if (card?.evoFile) {
          const priority = evoPriorities[newCards[i]] ?? 999;
          if (priority < bestPriority) {
            bestPriority = priority;
            bestEvoIndex = i;
          }
        }
      }
      if (bestEvoIndex !== -1) {
        [newCards[2], newCards[bestEvoIndex]] = [newCards[bestEvoIndex], newCards[2]];
        newSlot2Type = 'evo';
      }
    }
  } else {
    const card = cardDataMap[newCards[2]];
    if (card?.evoFile) newSlot2Type = 'evo';
    else if (card?.heroFile || card?.champion) newSlot2Type = 'hero';
    else newSlot2Type = null;
  }

  return { cards: newCards, slot2Type: newSlot2Type };
};

// ===== Функция расчёта бонуса для игрока (Фаза 2) =====
const calculatePlayerBonus = (
  cards: string[],
  slot2Type: string | null,
  levels: Record<string, number>,
  evolutions: string[],
  heroes: string[]
): {
  bonus: number;
  replacements: { slot: number; original: string; replacement: string }[];
  slotStatus: { slot: number; type: 'evo' | 'hero' | 'champion' | 'none'; active: boolean }[];
  changedCards: string[];
} => {
  const currentCards = [...cards];
  const usedIndices = new Set<number>();
  let bonus = 0;
  const replacements: { slot: number; original: string; replacement: string }[] = [];
  const slotStatus: { slot: number; type: 'evo' | 'hero' | 'champion' | 'none'; active: boolean }[] = [];

  const findBestReplacement = (
    slotIndices: number[],
    filterFn: (cardId: string) => boolean,
    priorityMap: Record<string, number>
  ): { index: number; cardId: string } | null => {
    let bestIndex = -1;
    let bestPriority = Infinity;
    for (const idx of slotIndices) {
      if (usedIndices.has(idx)) continue;
      const cardId = currentCards[idx];
      if (!filterFn(cardId)) continue;
      const priority = priorityMap[cardId] ?? 999;
      if (priority < bestPriority) {
        bestPriority = priority;
        bestIndex = idx;
      }
    }
    if (bestIndex === -1) return null;
    return { index: bestIndex, cardId: currentCards[bestIndex] };
  };

  // Обрабатываем слоты 0, 1, 2
  for (const slotIdx of [0, 1, 2]) {
    const cardId = currentCards[slotIdx];
    const cardData = cardDataMap[cardId];
    let type: 'evo' | 'hero' | 'champion' | 'none' = 'none';
    let active = false;

    if (slotIdx === 0) {
      // Слот 0 — эволюция
      if (cardData?.evoFile && evolutions.includes(cardId)) {
        bonus += 0.5;
        type = 'evo';
        active = true;
      } else {
        const replacement = findBestReplacement(
          [3, 4, 5, 6, 7],
          (id) => {
            const data = cardDataMap[id];
            return data?.evoFile !== undefined && evolutions.includes(id);
          },
          evoPriorities
        );
        if (replacement) {
          [currentCards[slotIdx], currentCards[replacement.index]] = [currentCards[replacement.index], currentCards[slotIdx]];
          usedIndices.add(slotIdx);
          usedIndices.add(replacement.index);
          bonus += 0.3;
          replacements.push({ slot: slotIdx, original: cardId, replacement: replacement.cardId });
          type = 'evo';
          active = true;
        } else {
          type = 'none';
          active = false;
        }
      }
    } else if (slotIdx === 1) {
      // Слот 1 — герой/чемпион
      const isHero = cardData?.heroFile !== undefined;
      const isChampion = cardData?.champion === true;
      const hasRequired = (isHero || isChampion) && heroes.includes(cardId);
      if (hasRequired) {
        bonus += 0.5;
        type = isChampion ? 'champion' : 'hero';
        active = true;
      } else {
        const replacement = findBestReplacement(
          [3, 4, 5, 6, 7],
          (id) => {
            const data = cardDataMap[id];
            if (!data) return false;
            if (isHero) return data.heroFile !== undefined && heroes.includes(id);
            if (isChampion) return data.champion === true && heroes.includes(id);
            return false;
          },
          isHero ? heroPriorities : championPriorities
        );
        if (replacement) {
          [currentCards[slotIdx], currentCards[replacement.index]] = [currentCards[replacement.index], currentCards[slotIdx]];
          usedIndices.add(slotIdx);
          usedIndices.add(replacement.index);
          bonus += 0.3;
          replacements.push({ slot: slotIdx, original: cardId, replacement: replacement.cardId });
          type = isChampion ? 'champion' : 'hero';
          active = true;
        } else {
          type = 'none';
          active = false;
        }
      }
    } else if (slotIdx === 2) {
      // Слот 2 — безумный
      const hasEvoFile = cardData?.evoFile !== undefined;
      const hasHeroFile = cardData?.heroFile !== undefined;
      const hasChampion = cardData?.champion === true;

      let expectedType: 'evo' | 'hero' | 'champion' | null = null;
      if (slot2Type === 'evo') expectedType = 'evo';
      else if (slot2Type === 'hero') expectedType = 'hero';
      else {
        // если slot2Type не задан, определяем по наличию у игрока
        if (hasEvoFile && evolutions.includes(cardId)) expectedType = 'evo';
        else if (hasHeroFile && heroes.includes(cardId)) expectedType = 'hero';
        else if (hasChampion && heroes.includes(cardId)) expectedType = 'champion';
      }

      // Если ожидаемый тип задан, но у игрока его нет, и при этом есть альтернативный тип для этой карты,
      // то меняем ожидаемый тип на альтернативный (если он есть)
      if (expectedType) {
        let hasRequired = false;
        if (expectedType === 'evo') hasRequired = evolutions.includes(cardId);
        else if (expectedType === 'hero') hasRequired = heroes.includes(cardId);
        else if (expectedType === 'champion') hasRequired = heroes.includes(cardId);

        // Если нет нужного типа, но есть альтернативный для этой же карты
        if (!hasRequired) {
          if (expectedType === 'evo' && hasHeroFile && heroes.includes(cardId)) {
            expectedType = 'hero';
            hasRequired = true;
          } else if (expectedType === 'hero' && hasEvoFile && evolutions.includes(cardId)) {
            expectedType = 'evo';
            hasRequired = true;
          }
          // Для чемпионов альтернативы нет
        }

        if (hasRequired) {
          bonus += 0.5;
          type = expectedType;
          active = true;
        } else {
          // Ищем замену среди обычных слотов
          let replacement = null;
          if (expectedType === 'hero' || expectedType === 'champion') {
            replacement = findBestReplacement(
              [3, 4, 5, 6, 7],
              (id) => {
                const data = cardDataMap[id];
                if (expectedType === 'hero') return data?.heroFile !== undefined && heroes.includes(id);
                else return data?.champion === true && heroes.includes(id);
              },
              expectedType === 'hero' ? heroPriorities : championPriorities
            );
          } else if (expectedType === 'evo') {
            replacement = findBestReplacement(
              [3, 4, 5, 6, 7],
              (id) => {
                const data = cardDataMap[id];
                return data?.evoFile !== undefined && evolutions.includes(id);
              },
              evoPriorities
            );
          }

          if (replacement) {
            [currentCards[slotIdx], currentCards[replacement.index]] = [currentCards[replacement.index], currentCards[slotIdx]];
            usedIndices.add(slotIdx);
            usedIndices.add(replacement.index);
            bonus += 0.3;
            replacements.push({ slot: slotIdx, original: cardId, replacement: replacement.cardId });
            type = expectedType;
            active = true;
          } else {
            type = 'none';
            active = false;
          }
        }
      } else {
        // Если ожидаемый тип не определён, ищем любую подходящую карту
        // Сначала ищем героя, потом эво
        let replacement = findBestReplacement(
          [3, 4, 5, 6, 7],
          (id) => {
            const data = cardDataMap[id];
            return data?.heroFile !== undefined && heroes.includes(id);
          },
          heroPriorities
        );
        if (replacement) {
          [currentCards[slotIdx], currentCards[replacement.index]] = [currentCards[replacement.index], currentCards[slotIdx]];
          usedIndices.add(slotIdx);
          usedIndices.add(replacement.index);
          bonus += 0.3;
          replacements.push({ slot: slotIdx, original: cardId, replacement: replacement.cardId });
          type = 'hero';
          active = true;
        } else {
          replacement = findBestReplacement(
            [3, 4, 5, 6, 7],
            (id) => {
              const data = cardDataMap[id];
              return data?.evoFile !== undefined && evolutions.includes(id);
            },
            evoPriorities
          );
          if (replacement) {
            [currentCards[slotIdx], currentCards[replacement.index]] = [currentCards[replacement.index], currentCards[slotIdx]];
            usedIndices.add(slotIdx);
            usedIndices.add(replacement.index);
            bonus += 0.3;
            replacements.push({ slot: slotIdx, original: cardId, replacement: replacement.cardId });
            type = 'evo';
            active = true;
          } else {
            type = 'none';
            active = false;
          }
        }
      }
    }

    slotStatus.push({ slot: slotIdx, type, active });
  }

  return { bonus, replacements, slotStatus, changedCards: currentCards };
};

// === Эндпоинты ===
// ---------- Game Progress ----------
// Получить прогресс игрока по имени
app.get('/api/game-progress/:playerName', async (req, res) => {
  const { playerName } = req.params;
  try {
    const progress = await prisma.gameProgress.findUnique({
      where: { playerName },
    });
    if (!progress) {
      return res.status(404).json({ error: 'Прогресс не найден' });
    }
    res.json({
      playerScore: progress.playerScore,
      computerScore: progress.computerScore,
      record: progress.record,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Ошибка загрузки прогресса' });
  }
});

// Сохранить (или обновить) прогресс
app.post('/api/game-progress', async (req, res) => {
  const { playerName, playerScore, computerScore, record } = req.body;
  if (playerName === undefined || playerScore === undefined || computerScore === undefined) {
    return res.status(400).json({ error: 'Не все поля заполнены' });
  }
  try {
    const player = await prisma.player.findUnique({
      where: { name: playerName },
    });
    if (!player) {
      return res.status(404).json({ error: 'Игрок не найден' });
    }

    const progress = await prisma.gameProgress.upsert({
      where: { playerName },
      update: {
        playerScore,
        computerScore,
        record: record || 0,
      },
      create: {
        playerName,
        playerScore,
        computerScore,
        record: record || 0,
        player: { connect: { name: playerName } },
      },
    });
    res.json({
      playerScore: progress.playerScore,
      computerScore: progress.computerScore,
      record: progress.record,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Ошибка сохранения прогресса' });
  }
});


app.get('/api/players', async (req, res) => {
  try {
    const players = await prisma.player.findMany({ orderBy: { name: 'asc' } });
    res.json(players);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

app.post('/api/players', async (req, res) => {
  try {
    const { name, levels, evolutions, heroes } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const existing = await prisma.player.findUnique({ where: { name } });
    if (existing) {
      const updated = await prisma.player.update({
        where: { name },
        data: {
          levels: levels || existing.levels,
          evolutions: evolutions || existing.evolutions,
          heroes: heroes || existing.heroes,
        }
      });
      return res.json(updated);
    } else {
      const newPlayer = await prisma.player.create({
        data: { name, levels: levels || '{}', evolutions: evolutions || '[]', heroes: heroes || '[]' }
      });
      return res.json(newPlayer);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to save player' });
  }
});

app.get('/api/players/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const player = await prisma.player.findUnique({ where: { name } });
    if (!player) return res.status(404).json({ error: 'Player not found' });
    res.json(player);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch player' });
  }
});

app.delete('/api/players/:name', async (req, res) => {
  try {
    const { name } = req.params;
    await prisma.player.delete({ where: { name } });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete player' });
  }
});

app.get('/api/meta-decks', async (req, res) => {
  try {
    const decks = await prisma.metaDeck.findMany({
      orderBy: { name: 'asc' },
      include: { category: true, source: true }
    });
    res.json(decks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch meta decks' });
  }
});

app.delete('/api/meta-decks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.metaDeck.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete meta deck' });
  }
});
// Получить одну мета-колоду
app.get('/api/meta-decks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deck = await prisma.metaDeck.findUnique({
      where: { id },
      include: { category: true, source: true }
    });
    if (!deck) return res.status(404).json({ error: 'Deck not found' });
    res.json(deck);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch deck' });
  }
});

// Обновить мета-колоду
app.put('/api/meta-decks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, cards, slot2Type, tier, winRate, categoryId, sourceId, sourceUrl } = req.body;
    if (!name || !cards || !Array.isArray(cards) || cards.length !== 8) {
      return res.status(400).json({ error: 'Name and exactly 8 cards are required' });
    }
    if (!categoryId || !sourceId) {
      return res.status(400).json({ error: 'categoryId and sourceId are required' });
    }
    const updated = await prisma.metaDeck.update({
      where: { id },
      data: {
        name,
        cards: JSON.stringify(cards),
        slot2Type: slot2Type || null,
        tier: tier || null,
        winRate: winRate ? parseFloat(winRate) : null,
        categoryId,
        sourceId,
        sourceUrl: sourceUrl || null,
      }
    });
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update deck' });
  }
});

app.post('/api/recommend', async (req, res) => {
  try {
    const { playerName } = req.body;
    if (!playerName) return res.status(400).json({ error: 'Player name is required' });

    const player = await prisma.player.findUnique({ where: { name: playerName } });
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const rawLevels = JSON.parse(player.levels);
    const evolutions = JSON.parse(player.evolutions);
    const heroes = JSON.parse(player.heroes);

    // Нормализация уровней
    const levels: Record<string, number> = {};
    Object.keys(rawLevels).forEach(key => {
      levels[key] = rawLevels[key];
    });
    if (rawLevels['The Log'] !== undefined) {
      levels['Log'] = rawLevels['The Log'];
    }

    // Фильтрация героев
    const filteredHeroes = heroes.filter((id: string) => {
      const card = cardDataMap[id];
      return card?.heroFile || card?.champion;
    });
    const metaDecks = await prisma.metaDeck.findMany({
      where: { isActive: true },
      include: { category: true, source: true },
    });

    const scoredDecks = [];

    for (const deck of metaDecks) {
      const currentCards = JSON.parse(deck.cards);
      const { cards: fixedCards, slot2Type: fixedSlot2Type } = fixDeckTemplate(currentCards, deck.slot2Type);

      if (JSON.stringify(fixedCards) !== JSON.stringify(currentCards) || fixedSlot2Type !== deck.slot2Type) {
        await prisma.metaDeck.update({
          where: { id: deck.id },
          data: {
            cards: JSON.stringify(fixedCards),
            slot2Type: fixedSlot2Type,
          },
        });
        deck.cards = JSON.stringify(fixedCards);
        deck.slot2Type = fixedSlot2Type;
      }

      const cardsArray = JSON.parse(deck.cards);
      const { bonus, replacements, slotStatus, changedCards } = calculatePlayerBonus(
        cardsArray,
        deck.slot2Type,
        levels,
        evolutions,
        filteredHeroes
      );

      // Расчёт среднего уровня по changedCards
      let totalLevel = 0;
      let missingCount = 0;
      const cardLevels: Record<string, number> = {};
      changedCards.forEach((cardId: string) => {
        const level = levels[cardId] || 1;
        cardLevels[cardId] = level;
        totalLevel += level;
        if (level === 1 && !levels[cardId]) missingCount++;
      });
      const averageLevel = totalLevel / changedCards.length;
      const score = averageLevel + bonus;

      scoredDecks.push({
        ...deck,
        cards: changedCards,
        cardLevels,
        averageLevel,
        missingCardsCount: missingCount,
        score,
        bonus,
        replacements,
        slot2Type: deck.slot2Type,
        slotStatus,
      });
    }

    const filtered = scoredDecks.filter(d => d.missingCardsCount <= 2);
    const sorted = filtered.sort((a, b) => b.score - a.score);
    const top = sorted.slice(0, 10);

    res.json({ success: true, decks: top, playerName });
  } catch (error: any) {
    console.error('❌ Ошибка в /api/recommend:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.post('/api/recommend-cw', async (req, res) => {
  try {
    const {
      playerName,
      limit = 5,
      includeCards = [],
      excludeCards = [],
      requiredDeckIds = []
    } = req.body;

    console.log('📥 /recommend-cw запрос:', { playerName, limit, includeCards, excludeCards, requiredDeckIds });

    if (!playerName) return res.status(400).json({ error: 'Player name is required' });

    const player = await prisma.player.findUnique({ where: { name: playerName } });
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const rawLevels = JSON.parse(player.levels);
    const evolutions = JSON.parse(player.evolutions);
    const heroes = JSON.parse(player.heroes);

    // Нормализация уровней
    const levels: Record<string, number> = {};
    Object.keys(rawLevels).forEach(key => {
      levels[key] = rawLevels[key];
    });
    if (rawLevels['The Log'] !== undefined) {
      levels['Log'] = rawLevels['The Log'];
    }

    const filteredHeroes = heroes.filter((id: string) => {
      const card = cardDataMap[id];
      return card?.heroFile || card?.champion;
    });

    // 1. Загружаем сохранённые колоды игрока
    const savedDecks = await prisma.savedDeck.findMany({
      where: { playerId: player.id },
      orderBy: { createdAt: 'desc' },
    });
    console.log(`📦 Загружено сохранённых колод: ${savedDecks.length}`);

    // 2. Формируем пул колод для оценки
    let decksToScore: { id: string; name: string; cards: string[]; slot2Type: string | null }[] = [];

    // Если есть обязательные колоды, добавляем их первыми
    if (requiredDeckIds && requiredDeckIds.length > 0) {
      const requiredSaved = savedDecks.filter(d => requiredDeckIds.includes(d.id));
      if (requiredSaved.length !== requiredDeckIds.length) {
        return res.json({
          success: true,
          combinations: [],
          totalCombinations: 0,
          message: 'Некоторые выбранные колоды не найдены в сохранённых',
          playerName,
        });
      }
      requiredSaved.forEach(d => {
        decksToScore.push({
          id: d.id,
          name: d.name,
          cards: JSON.parse(d.cards),
          slot2Type: null,
        });
      });
    }

    // Добавляем остальные сохранённые колоды
    const savedIds = new Set(decksToScore.map(d => d.id));
    const otherSaved = savedDecks.filter(d => !savedIds.has(d.id));
    otherSaved.forEach(d => {
      decksToScore.push({
        id: d.id,
        name: d.name,
        cards: JSON.parse(d.cards),
        slot2Type: null,
      });
    });

    // Если сохранённых колод меньше 4, добавляем мета-колоды
    if (decksToScore.length < 4) {
      const metaDecks = await prisma.metaDeck.findMany({
        where: { isActive: true },
        include: { category: true, source: true },
      });
      console.log(`📚 Добавлено мета-колод: ${metaDecks.length}`);
      metaDecks.forEach(md => {
        if (!decksToScore.some(d => d.id === md.id)) {
          decksToScore.push({
            id: md.id,
            name: md.name,
            cards: JSON.parse(md.cards),
            slot2Type: md.slot2Type || null,
          });
        }
      });
    }

    console.log(`🃏 Всего колод для оценки: ${decksToScore.length}`);

    // 3. Вычисляем score для каждой колоды
    const scoredDecks = [];
    for (const deck of decksToScore) {
      const { cards: fixedCards, slot2Type: fixedSlot2Type } = fixDeckTemplate(deck.cards, deck.slot2Type);
      const { bonus, slotStatus, changedCards } = calculatePlayerBonus(
        fixedCards,
        fixedSlot2Type,
        levels,
        evolutions,
        filteredHeroes
      );

      let totalLevel = 0;
      let missingCount = 0;
      changedCards.forEach((cardId: string) => {
        const level = levels[cardId] || 1;
        totalLevel += level;
        if (level === 1 && !levels[cardId]) missingCount++;
      });
      const averageLevel = totalLevel / changedCards.length;
      const score = averageLevel + bonus;

      scoredDecks.push({
        deckId: deck.id,
        name: deck.name,
        cards: changedCards,
        averageLevel,
        bonus,
        score,
        missingCount,
        tier: undefined,
        winRate: undefined,
        slot2Type: fixedSlot2Type,
        slotStatus,
      });
    }

    // 4. Применяем фильтры по картам
    let filteredDecks = scoredDecks;
    if (includeCards && includeCards.length > 0) {
      const before = filteredDecks.length;
      filteredDecks = filteredDecks.filter(deck =>
        includeCards.every(cardId => deck.cards.includes(cardId))
      );
      console.log(`🔍 Фильтр includeCards (${includeCards.length}): ${before} → ${filteredDecks.length}`);
    }
    if (excludeCards && excludeCards.length > 0) {
      const before = filteredDecks.length;
      filteredDecks = filteredDecks.filter(deck =>
        !excludeCards.some(cardId => deck.cards.includes(cardId))
      );
      console.log(`🔍 Фильтр excludeCards (${excludeCards.length}): ${before} → ${filteredDecks.length}`);
    }

    // 5. Оставляем только колоды с пропущенными картами <= 2
    const validDecks = filteredDecks.filter(d => d.missingCount <= 2);
    console.log(`✅ Колод с missingCount <= 2: ${validDecks.length} (из ${filteredDecks.length})`);

    if (validDecks.length < 2) {
      return res.json({
        success: true,
        combinations: [],
        totalCombinations: 0,
        message: `Недостаточно колод (${validDecks.length}) для составления связки. Зарегистрируйте новые колоды или улучшите карты!`,
        playerName,
      });
    }

    // 6. Проверяем обязательные колоды
    const requiredSet = new Set(requiredDeckIds || []);
    if (requiredSet.size > 0) {
      const foundRequired = validDecks.filter(d => requiredSet.has(d.deckId));
      if (foundRequired.length !== requiredSet.size) {
        return res.json({
          success: true,
          combinations: [],
          totalCombinations: 0,
          message: 'Некоторые обязательные колоды не прошли фильтрацию по картам или имеют слишком много пропусков',
          playerName,
        });
      }
    }

    // 7. Генерация комбинаций
    const hasOverlap = (deckList: typeof validDecks): boolean => {
      const usedCards = new Set<string>();
      for (const deck of deckList) {
        for (const card of deck.cards) {
          if (usedCards.has(card)) return true;
          usedCards.add(card);
        }
      }
      return false;
    };

    const getCombinations = (arr: any[], k: number): any[][] => {
      if (k === 0) return [[]];
      if (arr.length === 0) return [];
      const result: any[][] = [];
      const [first, ...rest] = arr;
      const withFirst = getCombinations(rest, k - 1).map(comb => [first, ...comb]);
      const withoutFirst = getCombinations(rest, k);
      return [...withFirst, ...withoutFirst];
    };

    let bestCombinations: { decks: typeof validDecks; totalScore: number; avgScore: number }[] = [];
    let foundSize = 0;

    const maxSize = 4;
    const minSize = 2;

    for (let size = maxSize; size >= minSize; size--) {
      const combos = getCombinations(validDecks, size);
      let validCombos = combos.filter(combo => !hasOverlap(combo));
      if (requiredSet.size > 0) {
        validCombos = validCombos.filter(combo => {
          const deckIds = combo.map(d => d.deckId);
          return Array.from(requiredSet).every(id => deckIds.includes(id));
        });
      }
      if (validCombos.length > 0) {
        const sorted = validCombos.map(combo => {
          const totalScore = combo.reduce((sum, d) => sum + d.score, 0);
          const avgScore = totalScore / combo.length;
          return { decks: combo, totalScore, avgScore };
        }).sort((a, b) => b.totalScore - a.totalScore);
        bestCombinations = sorted.slice(0, limit);
        foundSize = size;
        break;
      }
    }

    if (bestCombinations.length === 0) {
      return res.json({
        success: true,
        combinations: [],
        totalCombinations: 0,
        message: 'Не найдено связок без пересечений. Попробуйте изменить фильтры или добавьте больше колод!',
        playerName,
      });
    }

    res.json({
      success: true,
      combinations: bestCombinations,
      totalCombinations: bestCombinations.length,
      foundSize,
      playerName,
      message: undefined,
    });
  } catch (error: any) {
    console.error('❌ Ошибка в /api/recommend-cw:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.post('/api/diagnose', async (req, res) => {
  try {
    const { playerName, targetLevel = 13 } = req.body;
    if (!playerName) return res.status(400).json({ error: 'Player name is required' });

    const player = await prisma.player.findUnique({ where: { name: playerName } });
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const levels = JSON.parse(player.levels);
    const upgradeCosts: Record<number, number> = {
      1: 0, 2: 5, 3: 20, 4: 50, 5: 150, 6: 400, 7: 1000, 8: 2000,
      9: 4000, 10: 8000, 11: 20000, 12: 50000, 13: 100000
    };

    const diagnosis: { card: string; currentLevel: number; neededGold: number }[] = [];
    let totalGold = 0;

    Object.keys(levels).forEach(card => {
      const current = levels[card] || 1;
      if (current < targetLevel) {
        let cost = 0;
        for (let lv = current; lv < targetLevel; lv++) {
          cost += upgradeCosts[lv] || 0;
        }
        totalGold += cost;
        diagnosis.push({ card, currentLevel: current, neededGold: cost });
      }
    });

    diagnosis.sort((a, b) => b.neededGold - a.neededGold);

    res.json({
      success: true,
      playerName,
      targetLevel,
      totalGold,
      details: diagnosis,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Diagnose failed' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/meta-decks/import-deckshop', async (req, res) => {
  // ... (оставлен как в исходном файле, без изменений)
  try {
    const { category = 'general' } = req.body;

    const deckshopSource = await prisma.source.upsert({
      where: { name: 'deckshop' },
      update: {},
      create: { name: 'deckshop' },
    });
    const categoryRecord = await prisma.category.upsert({
      where: { name: category },
      update: {},
      create: { name: category },
    });

    const urlsToTry = [
      'https://www.deckshop.pro/ru/decks/popular',
      'https://www.deckshop.pro/ru/decks',
      'https://www.deckshop.pro/ru/deck-list',
      'https://www.deckshop.pro/ru/',
      'https://www.deckshop.pro/ru/best-decks/',
    ];

    let html = '';
    let successUrl = '';
    for (const url of urlsToTry) {
      try {
        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          timeout: 8000,
        });
        if (response.status === 200) {
          html = response.data;
          successUrl = url;
          break;
        }
      } catch (e) { }
    }

    if (!html) {
      return res.status(404).json({
        error: 'Не удалось получить данные с deckshop.pro. Возможно, сайт временно недоступен или изменил структуру.',
        suggestion: 'Пожалуйста, добавьте колоды вручную через форму "Добавить мета-колоду".'
      });
    }

    const $ = cheerio.load(html);
    const decks: { name: string; cards: string[]; tier?: string; winRate?: number }[] = [];

    const possibleSelectors = [
      '.deck-list-item',
      '.deck-item',
      '.deck-card',
      '.deck',
      '[data-testid="deck"]',
      '.col-lg-4 .card',
      '.deck-preview',
      '.deck-card-container',
    ];

    for (const selector of possibleSelectors) {
      const elements = $(selector);
      if (elements.length > 0) {
        elements.each((i, el) => {
          const name = $(el).find('.deck-name, .title, h4, h5').first().text().trim() || `Колода ${i+1}`;
          const cards: string[] = [];
          $(el).find('.card-name, .card, .deck-card, .card-img-alt, img[alt]').each((j, cardEl) => {
            let cardName = $(cardEl).text().trim() || $(cardEl).attr('alt') || '';
            cardName = cardName.replace(/[^a-zA-Z ]/g, '').trim();
            if (cardName && ALL_CARDS.includes(cardName)) {
              cards.push(cardName);
            }
          });
          if (cards.length === 8) {
            const tier = $(el).find('.tier, .deck-tier, .badge').first().text().trim() || null;
            const winRateText = $(el).find('.win-rate, .winrate, .percentage').first().text().trim();
            const winRate = winRateText ? parseFloat(winRateText) : null;
            decks.push({ name, cards, tier: tier || undefined, winRate: winRate || undefined });
          }
        });
        if (decks.length > 0) break;
      }
    }

    if (decks.length === 0) {
      return res.status(404).json({
        error: 'Не удалось найти колоды на странице. Структура сайта изменилась.',
        suggestion: 'Вы можете добавить колоды вручную через форму "Добавить мета-колоду".'
      });
    }

    let imported = 0;
    for (const deck of decks) {
      const existing = await prisma.metaDeck.findUnique({ where: { name: deck.name } });
      if (!existing) {
        await prisma.metaDeck.create({
          data: {
            name: deck.name,
            cards: JSON.stringify(deck.cards),
            tier: deck.tier || null,
            winRate: deck.winRate || null,
            sourceId: deckshopSource.id,
            categoryId: categoryRecord.id,
            sourceUrl: successUrl,
            isActive: true,
          }
        });
        imported++;
      }
    }

    res.json({
      success: true,
      imported,
      total: decks.length,
      message: `Импортировано ${imported} колод из ${decks.length} найденных.`
    });
  } catch (error: any) {
    console.error('Import error:', error.message);
    res.status(500).json({
      error: 'Ошибка при импорте: ' + error.message,
      suggestion: 'Попробуйте добавить колоды вручную через форму "Добавить мета-колоду".'
    });
  }
});

app.post('/api/meta-decks', async (req, res) => {
  try {
    const { name, cards, slot2Type, tier, winRate, categoryId, sourceId, sourceUrl, externalId } = req.body;
    if (!name || !cards || !Array.isArray(cards) || cards.length !== 8) {
      return res.status(400).json({ error: 'Name and exactly 8 cards are required' });
    }
    if (!categoryId || !sourceId) {
      return res.status(400).json({ error: 'categoryId and sourceId are required' });
    }
    const newDeck = await prisma.metaDeck.create({
      data: {
        name,
        cards: JSON.stringify(cards),
        slot2Type: slot2Type || null,
        tier: tier || null,
        winRate: winRate ? parseFloat(winRate) : null,
        categoryId,
        sourceId,
        sourceUrl: sourceUrl || null,
        externalId: externalId || null,
        isActive: true,
      }
    });
    res.json(newDeck);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create meta deck' });
  }
});

app.post('/api/meta-decks/import-mock', async (req, res) => {
  try {
    const mockSource = await prisma.source.upsert({
      where: { name: 'mock' },
      update: {},
      create: { name: 'mock' },
    });
    const generalCategory = await prisma.category.upsert({
      where: { name: 'general' },
      update: {},
      create: { name: 'general' },
    });

    const mockDecks = [
      { name: 'Hog 2.6 Cycle', cards: ['Hog Rider', 'Musketeer', 'Ice Golem', 'Skeleton', 'Ice Spirit', 'Cannon', 'Fireball', 'Log'], slot2Type: null, tier: 'S', winRate: 52.5 },
      { name: 'Golem Beatdown', cards: ['Golem', 'Night Witch', 'Dark Prince', 'Tornado', 'Lightning', 'Barbarian Barrel', 'Baby Dragon', 'Mega Minion'], slot2Type: null, tier: 'A', winRate: 50.1 },
    ];

    let imported = 0;
    for (const deck of mockDecks) {
      const existing = await prisma.metaDeck.findUnique({ where: { name: deck.name } });
      if (!existing) {
        await prisma.metaDeck.create({
          data: {
            name: deck.name,
            cards: JSON.stringify(deck.cards),
            slot2Type: deck.slot2Type || null,
            tier: deck.tier || null,
            winRate: deck.winRate || null,
            sourceId: mockSource.id,
            categoryId: generalCategory.id,
            isActive: true,
          }
        });
        imported++;
      }
    }
    res.json({ success: true, imported, message: `Импортировано ${imported} мок-колод` });
  } catch (error: any) {
    console.error('Mock import error:', error.message);
    res.status(500).json({ error: 'Ошибка импорта мок-колод' });
  }
});

// === Categories & Sources CRUD ===
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await prisma.category.findMany({ orderBy: { name: 'asc' } });
    res.json(categories);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

app.post('/api/categories', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const category = await prisma.category.create({ data: { name } });
    res.json(category);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

app.delete('/api/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const decks = await prisma.metaDeck.count({ where: { categoryId: id } });
    if (decks > 0) {
      return res.status(400).json({ error: 'Cannot delete category with existing decks' });
    }
    await prisma.category.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

app.get('/api/sources', async (req, res) => {
  try {
    const sources = await prisma.source.findMany({ orderBy: { name: 'asc' } });
    res.json(sources);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch sources' });
  }
});

app.post('/api/sources', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const source = await prisma.source.create({ data: { name } });
    res.json(source);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create source' });
  }
});

app.delete('/api/sources/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const decks = await prisma.metaDeck.count({ where: { sourceId: id } });
    if (decks > 0) {
      return res.status(400).json({ error: 'Cannot delete source with existing decks' });
    }
    await prisma.source.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete source' });
  }
});
// === Сохранённые колоды ===

// Получить все сохранённые колоды для игрока
app.get('/api/saved-decks', async (req, res) => {
  try {
    const { playerName } = req.query;
    if (!playerName) return res.status(400).json({ error: 'Player name is required' });

    const player = await prisma.player.findUnique({ where: { name: String(playerName) } });
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const decks = await prisma.savedDeck.findMany({
      where: { playerId: player.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json(decks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch saved decks' });
  }
});

// Сохранить колоду
app.post('/api/saved-decks', async (req, res) => {
  try {
    const { playerName, name, cards } = req.body;
    if (!playerName || !name || !cards || !Array.isArray(cards) || cards.length !== 8) {
      return res.status(400).json({ error: 'Invalid data' });
    }

    const player = await prisma.player.findUnique({ where: { name: playerName } });
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const savedDeck = await prisma.savedDeck.create({
      data: {
        playerId: player.id,
        name,
        cards: JSON.stringify(cards),
      },
    });
    res.json(savedDeck);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to save deck' });
  }
});

// Удалить сохранённую колоду
app.delete('/api/saved-decks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.savedDeck.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete saved deck' });
  }
});

// === Диагностика колоды ===

app.post('/api/diagnose-deck', async (req, res) => {
  try {
    const { playerName, deckId } = req.body;
    if (!playerName || !deckId) {
      return res.status(400).json({ error: 'Player name and deckId are required' });
    }

    const player = await prisma.player.findUnique({ where: { name: playerName } });
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const savedDeck = await prisma.savedDeck.findFirst({
      where: { id: deckId, playerId: player.id },
    });
    if (!savedDeck) return res.status(404).json({ error: 'Saved deck not found' });

    const cards = JSON.parse(savedDeck.cards);
    const levels = JSON.parse(player.levels);
    const targetLevel = 16;

    // Стоимости апгрейда с 1 по 16
    const upgradeCosts: Record<number, number> = {
      1: 0, 2: 5, 3: 20, 4: 50, 5: 150, 6: 400, 7: 1000, 8: 2000,
      9: 4000, 10: 8000, 11: 20000, 12: 50000, 13: 100000, 14: 200000, 15: 400000, 16: 800000
    };

    const diagnosis = cards.map((cardId: string) => {
      const currentLevel = levels[cardId] || 1;
      let cost = 0;
      for (let lv = currentLevel; lv < targetLevel; lv++) {
        cost += upgradeCosts[lv] || 0;
      }
      return {
        card: cardId,
        currentLevel,
        neededGold: cost,
      };
    });

    const totalGold = diagnosis.reduce((sum, item) => sum + item.neededGold, 0);

    res.json({
      success: true,
      deckName: savedDeck.name,
      totalGold,
      details: diagnosis,
      targetLevel,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Diagnose failed' });
  }
});
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✓ Server running on http://localhost:${PORT}`);
});
