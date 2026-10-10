import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import * as Dialog from '@radix-ui/react-dialog';
import {
  XMarkIcon,
  BoltIcon,
  SunIcon,
  MoonIcon,
} from '@heroicons/react/24/outline';
import { savePlayer, getPlayer } from '../api';
import { ALL_CARDS_DATA, getEvoCards, getHeroCards, rarityColors, Rarity } from '../data/cards';
import { cardTranslations } from '../utils/cardTranslations';
import { CardIcon } from '../utils/cardImages';
import { useTheme } from '../context/ThemeContext';

const ALL_CARDS = ALL_CARDS_DATA.map(c => c.id);
const EVO_CARDS_IDS = getEvoCards().map(c => c.id);
// Только настоящие герои (heroFile && !champion)
const HERO_CARDS_IDS = getHeroCards().filter(c => !c.champion).map(c => c.id);
// Убираем чемпионов из специальных карт
const ALL_SPECIAL_CARDS_IDS = [...HERO_CARDS_IDS];

const MAX_LEVEL = 16;

const cardImageMap: Record<string, string> = {};
const evoImageMap: Record<string, string> = {};
const heroImageMap: Record<string, string> = {};
ALL_CARDS_DATA.forEach(c => {
  cardImageMap[c.id] = c.file;
  if (c.evoFile) evoImageMap[c.id] = c.evoFile;
  if (c.heroFile) heroImageMap[c.id] = c.heroFile;
});

const getRarityClass = (cardId: string): string => {
  const card = ALL_CARDS_DATA.find(c => c.id === cardId);
  return card ? rarityColors[card.rarity] : '';
};

const getImageUrls = (basePath: string, fileName: string): string[] => {
  const webp = `${basePath}/${fileName}.webp`;
  const png = `${basePath}/${fileName}.png`;
  return [webp, png];
};

const normalizeLevel = (value: string): number | null => {
  if (value === '') return null;
  const num = Number(value);
  if (isNaN(num)) return null;
  if (num < 1) return 1;
  if (num > MAX_LEVEL) return MAX_LEVEL;
  return num;
};

const PlayerForm: React.FC = () => {
  const { name } = useParams<{ name: string }>();
  const isEdit = !!name;
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [activeTab, setActiveTab] = useState<'levels' | 'specials'>('levels');
  const [playerName, setPlayerName] = useState('');
  const [levels, setLevels] = useState<Record<string, string>>({});
  const [evolutions, setEvolutions] = useState<string[]>([]);
  const [heroes, setHeroes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [quickMode, setQuickMode] = useState(false);
  const [quickCards, setQuickCards] = useState<string[]>([]);
  const [quickIndex, setQuickIndex] = useState(0);
  const [quickValue, setQuickValue] = useState('');
  const quickInputRef = useRef<HTMLInputElement>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (isEdit && name) {
      const fetchPlayer = async () => {
        try {
          const data = await getPlayer(decodeURIComponent(name));
          setPlayerName(data.name);
          const parsedLevels = JSON.parse(data.levels);
          const stringLevels: Record<string, string> = {};
          Object.keys(parsedLevels).forEach(key => {
            stringLevels[key] = String(parsedLevels[key]);
          });
          setLevels(stringLevels);
          setEvolutions(JSON.parse(data.evolutions));
          setHeroes(JSON.parse(data.heroes));
        } catch {
          setError('Не удалось загрузить данные аккаунта');
        }
      };
      fetchPlayer();
    }
  }, [isEdit, name]);

  useEffect(() => {
    if (quickMode && quickInputRef.current) {
      quickInputRef.current.focus();
    }
  }, [quickMode, quickIndex]);

  const handleLevelBlur = (card: string, value: string) => {
    const normalized = normalizeLevel(value);
    if (normalized === null) {
      setLevels(prev => {
        const newLevels = { ...prev };
        delete newLevels[card];
        return newLevels;
      });
    } else {
      setLevels(prev => ({ ...prev, [card]: String(normalized) }));
    }
  };

  const focusNextInput = (currentIndex: number) => {
    const nextIndex = currentIndex + 1;
    if (nextIndex < inputRefs.current.length) {
      const nextInput = inputRefs.current[nextIndex];
      if (nextInput) {
        setTimeout(() => nextInput.focus(), 0);
      }
    }
  };

  const toggleEvolution = (card: string) => {
    setEvolutions(prev => prev.includes(card) ? prev.filter(c => c !== card) : [...prev, card]);
  };

  const toggleHero = (card: string) => {
    setHeroes(prev => prev.includes(card) ? prev.filter(c => c !== card) : [...prev, card]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) {
      setError('Введите имя аккаунта');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const numericLevels: Record<string, number> = {};
      Object.keys(levels).forEach(key => {
        const num = Number(levels[key]);
        if (!isNaN(num) && num >= 1 && num <= MAX_LEVEL) {
          numericLevels[key] = num;
        }
      });
      await savePlayer({
        name: playerName.trim(),
        levels: JSON.stringify(numericLevels),
        evolutions: JSON.stringify(evolutions),
        heroes: JSON.stringify(heroes),
      });
      navigate('/players');
    } catch {
      setError('Ошибка при сохранении аккаунта');
      setLoading(false);
    }
  };

  const startQuickMode = () => {
    const emptyCards = ALL_CARDS.filter(cardId => !levels[cardId] || levels[cardId] === '');
    if (emptyCards.length === 0) {
      alert('Все уровни уже заполнены!');
      return;
    }
    setQuickCards(emptyCards);
    setQuickIndex(0);
    setQuickMode(true);
    setQuickValue('');
  };

  const handleQuickKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const cardId = quickCards[quickIndex];
      if (!cardId) return;
      const normalized = normalizeLevel(quickValue);
      if (normalized !== null) {
        setLevels(prev => ({ ...prev, [cardId]: String(normalized) }));
      } else {
        setLevels(prev => {
          const newLevels = { ...prev };
          delete newLevels[cardId];
          return newLevels;
        });
      }
      setQuickValue('');
      if (quickIndex < quickCards.length - 1) {
        setQuickIndex(quickIndex + 1);
      } else {
        setQuickMode(false);
        alert('Все уровни заполнены!');
      }
    } else if (e.key === 'Escape') {
      setQuickMode(false);
    }
  };

  // ---- Компоненты с анимациями ----

  // Карточка уровня с анимацией появления
  const LevelCard = ({ cardId, index }: { cardId: string; index: number }) => {
    const imgFile = cardImageMap[cardId] || cardId;
    const imgUrls = getImageUrls('/cards', imgFile);
    const defaultValue = levels[cardId] || '';

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, delay: index * 0.01 }}
        className="flex flex-col items-center p-0"
      >
        <div className={`relative w-12 h-12 rounded flex items-center justify-center ${
          isDark ? 'bg-gray-700' : 'bg-gray-100'
        }`}>
          <img
            src={imgUrls[0]}
            alt=""
            loading="lazy"
            className="w-full h-full object-contain transition-opacity duration-200"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              if (target.src.endsWith('.webp') && imgUrls.length > 1) {
                target.src = imgUrls[1];
              } else {
                target.style.display = 'none';
              }
            }}
          />
          <input
            ref={(el) => (inputRefs.current[index] = el)}
            type="text"
            inputMode="numeric"
            defaultValue={defaultValue}
            onBlur={(e) => handleLevelBlur(cardId, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                focusNextInput(index);
              }
            }}
            onChange={(e) => {
              const val = e.target.value;
              if (val.length >= 2 && /^\d{2}$/.test(val)) {
                focusNextInput(index);
              }
            }}
            className={`absolute bottom-0.5 left-1/2 transform -translate-x-1/2 w-4 rounded px-0.5 py-0.5 text-[9px] text-center focus:outline-none transition-colors duration-200 ${
              isDark
                ? 'bg-gray-800/80 border-gray-600 text-gray-200 focus:border-blue-400'
                : 'bg-white/80 border-gray-300 text-gray-900 focus:border-blue-500'
            } border`}
            placeholder="—"
          />
        </div>
      </motion.div>
    );
  };

  // Группа редкости с анимацией
  const RarityGroup = ({ rarity, cards }: { rarity: Rarity; cards: string[] }) => {
    const color = rarityColors[rarity];
    const groupName = rarityDisplayNames[rarity];

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={`border-2 ${color} rounded-lg p-2 mb-3 ${
          isDark ? 'bg-gray-800/50' : 'bg-white/50'
        }`}
      >
        <div className={`text-xs font-semibold px-1 mb-1 ${
          isDark ? 'text-gray-300' : 'text-gray-600'
        }`}>
          {groupName}
        </div>
        <div className="flex flex-wrap gap-0.5">
          {cards.map((cardId) => {
            const globalIndex = ALL_CARDS.indexOf(cardId);
            return <LevelCard key={cardId} cardId={cardId} index={globalIndex} />;
          })}
        </div>
      </motion.div>
    );
  };

  // Карточка для эволюций/героев
  const SelectableCardTile = ({
    cardId,
    checked,
    onToggle,
    imageMap,
    basePath,
  }: {
    cardId: string;
    checked: boolean;
    onToggle: () => void;
    imageMap: Record<string, string>;
    basePath: string;
  }) => {
    const rusName = cardTranslations[cardId] || cardId;
    const imgFile = checked ? imageMap[cardId] : cardImageMap[cardId];
    const path = checked ? basePath : '/cards';
    const imgUrls = getImageUrls(path, imgFile);

    return (
      <motion.div
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={`flex flex-col items-center cursor-pointer p-0 rounded transition-colors duration-200 ${
          isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
        }`}
        onClick={onToggle}
        title={checked ? 'Нажмите, чтобы убрать' : 'Нажмите, чтобы добавить'}
      >
        <div className={`relative w-11 h-11 rounded flex items-center justify-center ${
          isDark ? 'bg-gray-700' : 'bg-gray-100'
        }`}>
          <img
            src={imgUrls[0]}
            alt={rusName}
            loading="lazy"
            className="w-full h-full object-contain transition-opacity duration-200"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              if (target.src.endsWith('.webp') && imgUrls.length > 1) {
                target.src = imgUrls[1];
              } else {
                target.style.display = 'none';
              }
            }}
          />
          <div className="absolute top-0 right-0">
            <input
              type="checkbox"
              checked={checked}
              readOnly
              className="w-3 h-3 pointer-events-none"
            />
          </div>
        </div>
        <span className={`text-[8px] font-medium truncate w-10 text-center leading-tight mt-0.5 ${
          isDark ? 'text-gray-300' : 'text-gray-700'
        }`} title={rusName}>
          {rusName}
        </span>
      </motion.div>
    );
  };

  // Вкладки с анимацией
  const renderTabs = () => (
    <div className="flex border-b border-gray-300 dark:border-gray-700 mb-4">
      <button
        type="button"
        className={`py-2 px-4 text-sm font-medium transition-colors duration-200 ${
          activeTab === 'levels'
            ? `border-b-2 border-blue-500 text-blue-600 dark:text-blue-400`
            : `text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200`
        }`}
        onClick={() => setActiveTab('levels')}
      >
        Уровни
      </button>
      <button
        type="button"
        className={`py-2 px-4 text-sm font-medium transition-colors duration-200 ${
          activeTab === 'specials'
            ? `border-b-2 border-blue-500 text-blue-600 dark:text-blue-400`
            : `text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200`
        }`}
        onClick={() => setActiveTab('specials')}
      >
        Эволюции и Герои
      </button>
    </div>
  );

  // Анимированный контент вкладок
  const TabContent = ({ children }: { children: React.ReactNode }) => (
    <AnimatePresence mode="wait">
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );

  const rarityOrder: Rarity[] = ['Common', 'Rare', 'Epic', 'Legendary', 'Champion'];
  const rarityDisplayNames: Record<Rarity, string> = {
    Common: 'Обычные',
    Rare: 'Редкие',
    Epic: 'Эпические',
    Legendary: 'Легендарные',
    Champion: 'Чемпионы',
  };

  return (
    <div className={`max-w-7xl mx-auto transition-colors duration-200 ${
      isDark ? 'text-gray-200' : 'text-gray-900'
    }`}>
      <h2 className="text-2xl font-bold mb-4">{isEdit ? 'Редактировать' : 'Добавить'} аккаунт</h2>

      <form onSubmit={handleSubmit} className={`p-4 rounded-lg shadow transition-colors duration-200 ${
        isDark ? 'bg-gray-800' : 'bg-white'
      }`}>
        <div className="mb-4">
          <label className={`block font-medium mb-1 ${
            isDark ? 'text-gray-300' : 'text-gray-700'
          }`}>Имя аккаунта</label>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            className={`w-full rounded px-3 py-2 transition-colors duration-200 ${
              isDark
                ? 'bg-gray-700 border-gray-600 text-gray-200 focus:border-blue-400'
                : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
            } border focus:outline-none`}
            disabled={isEdit}
            required
          />
        </div>

        {renderTabs()}

        <TabContent>
          {activeTab === 'levels' && (
            <>
              <div className="mb-4 flex justify-end">
                <button
                  type="button"
                  onClick={startQuickMode}
                  className={`flex items-center gap-1 px-4 py-2 rounded text-sm transition-colors duration-200 ${
                    isDark
                      ? 'bg-green-700 hover:bg-green-600 text-white'
                      : 'bg-green-600 hover:bg-green-700 text-white'
                  }`}
                >
                  <BoltIcon className="w-4 h-4" />
                  Быстрый ввод
                </button>
              </div>
              <div className="mb-6">
                <h3 className={`text-lg font-semibold mb-3 ${
                  isDark ? 'text-gray-300' : 'text-gray-700'
                }`}>Уровни карт (1–16)</h3>
                {rarityOrder.map(rarity => {
                  const cards = ALL_CARDS_DATA.filter(c => c.rarity === rarity).map(c => c.id);
                  if (cards.length === 0) return null;
                  return <RarityGroup key={rarity} rarity={rarity} cards={cards} />;
                })}
              </div>
            </>
          )}

          {activeTab === 'specials' && (
            <div className="space-y-4">
              <div className={`border-2 border-purple-400 rounded-lg p-2 ${
                isDark ? 'bg-gray-800/50' : 'bg-white/50'
              }`}>
                <div className={`text-xs font-semibold px-1 mb-1 ${
                  isDark ? 'text-gray-300' : 'text-gray-600'
                }`}>Эволюции</div>
                <div className="flex flex-wrap gap-0.5">
                  {EVO_CARDS_IDS.map(cardId => (
                    <SelectableCardTile
                      key={cardId}
                      cardId={cardId}
                      checked={evolutions.includes(cardId)}
                      onToggle={() => toggleEvolution(cardId)}
                      imageMap={evoImageMap}
                      basePath="/cards/Evo"
                    />
                  ))}
                </div>
              </div>
              <div className={`border-2 border-yellow-400 rounded-lg p-2 ${
                isDark ? 'bg-gray-800/50' : 'bg-white/50'
              }`}>
                <div className={`text-xs font-semibold px-1 mb-1 ${
                  isDark ? 'text-gray-300' : 'text-gray-600'
                }`}>Герои (Hero)</div>
                <div className="flex flex-wrap gap-0.5">
                  {ALL_SPECIAL_CARDS_IDS.map(cardId => (
                    <SelectableCardTile
                      key={cardId}
                      cardId={cardId}
                      checked={heroes.includes(cardId)}
                      onToggle={() => toggleHero(cardId)}
                      imageMap={heroImageMap}
                      basePath="/cards/Hero"
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </TabContent>

        {error && <div className="text-red-500 mt-4">{error}</div>}

        <div className="flex gap-3 mt-4">
          <button
            type="submit"
            disabled={loading}
            className={`px-6 py-2 rounded transition-all duration-200 ${
              loading
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:shadow-lg transform hover:scale-105'
            } ${isDark ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
          >
            {loading ? 'Сохранение...' : isEdit ? 'Обновить' : 'Создать'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/players')}
            className={`px-6 py-2 rounded transition-colors duration-200 ${
              isDark
                ? 'bg-gray-600 hover:bg-gray-500 text-gray-200'
                : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
            }`}
          >
            Отмена
          </button>
        </div>
      </form>

      {/* Модальное окно быстрого ввода с Radix Dialog и анимацией */}
      <Dialog.Root open={quickMode} onOpenChange={setQuickMode}>
        <AnimatePresence>
          {quickMode && (
            <Dialog.Portal forceMount>
              <Dialog.Overlay asChild>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
                />
              </Dialog.Overlay>
              <Dialog.Content className="fixed inset-0 flex items-center justify-center z-50 p-4">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 20 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  className={`max-w-sm w-full rounded-lg shadow-xl p-6 ${
                    isDark ? 'bg-gray-800 text-gray-200' : 'bg-white text-gray-900'
                  }`}
                >
                  <Dialog.Close asChild>
                    <button
                      className={`absolute top-2 right-2 p-1 rounded-full transition-colors ${
                        isDark
                          ? 'hover:bg-gray-700 text-gray-400'
                          : 'hover:bg-gray-100 text-gray-600'
                      }`}
                      aria-label="Закрыть"
                    >
                      <XMarkIcon className="w-5 h-5" />
                    </button>
                  </Dialog.Close>
                  <Dialog.Title className="text-lg font-bold mb-2 text-center">
                    Осталось: {quickCards.length - quickIndex} карт
                  </Dialog.Title>
                  <div className="flex flex-col items-center">
                    {quickCards[quickIndex] && (
                      <>
                        <div className="w-24 h-24 mb-2">
                          <CardIcon
                            cardId={quickCards[quickIndex]}
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <p className={`text-sm font-medium ${
                          isDark ? 'text-gray-300' : 'text-gray-700'
                        }`}>
                          {cardTranslations[quickCards[quickIndex]] || quickCards[quickIndex]}
                        </p>
                      </>
                    )}
                    <input
                      ref={quickInputRef}
                      type="text"
                      inputMode="numeric"
                      value={quickValue}
                      onChange={(e) => setQuickValue(e.target.value.replace(/\D/g, ''))}
                      onKeyDown={handleQuickKeyDown}
                      className={`mt-4 w-20 rounded px-2 py-1 text-center text-lg focus:outline-none transition-colors ${
                        isDark
                          ? 'bg-gray-700 border-gray-600 text-gray-200 focus:border-blue-400'
                          : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
                      } border`}
                      placeholder={`1-${MAX_LEVEL}`}
                      autoFocus
                    />
                    <p className={`text-xs mt-2 ${
                      isDark ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      Введите уровень ({`1-${MAX_LEVEL}`}) и нажмите Enter
                    </p>
                    <Dialog.Close asChild>
                      <button
                        className={`mt-4 text-sm transition-colors ${
                          isDark ? 'text-red-400 hover:text-red-300' : 'text-red-500 hover:text-red-600'
                        }`}
                      >
                        Закрыть (Esc)
                      </button>
                    </Dialog.Close>
                  </div>
                </motion.div>
              </Dialog.Content>
            </Dialog.Portal>
          )}
        </AnimatePresence>
      </Dialog.Root>
    </div>
  );
};

export default PlayerForm;
