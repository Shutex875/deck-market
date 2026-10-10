import React, { useState, useEffect, memo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import {
  XMarkIcon,
  PlusIcon,
  TrashIcon,
  ArrowLeftIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';

import {
  createMetaDeck,
  updateMetaDeck,
  deleteMetaDeck,
  getMetaDeck,
  getCategories,
  getSources,
  createCategory,
  deleteCategory,
  createSource,
  deleteSource,
  Category,
  Source,
} from '../api';
import { ALL_CARDS_DATA, Rarity } from '../data/cards';
import { cardTranslations } from '../utils/cardTranslations';
import { CardIcon } from '../utils/cardImages';
import { useTheme } from '../context/ThemeContext';

type SlotType = 'evo' | 'hero' | 'normal';

// Компонент карты внутри слота (перетаскиваемая)
const DraggableCardInSlot = memo(({
  cardId,
  slotIndex,
  slot2Type,
  isDark,
}: {
  cardId: string;
  slotIndex: number;
  slot2Type: 'evo' | 'hero' | null;
  isDark: boolean;
}) => {
  const draggableId = `slot-card-${slotIndex}`;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useDraggable({
    id: draggableId,
    data: { slotIndex, cardId },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const card = ALL_CARDS_DATA.find(c => c.id === cardId);
  if (!card) return null;

  let customSrc: string | undefined = undefined;
  if (slotIndex === 0 && card.evoFile) {
    customSrc = `/cards/Evo/${card.evoFile}.webp`;
  } else if (slotIndex === 1 && card.heroFile) {
    customSrc = `/cards/Hero/${card.heroFile}.webp`;
  } else if (slotIndex === 2) {
    if (slot2Type === 'evo' && card.evoFile) {
      customSrc = `/cards/Evo/${card.evoFile}.webp`;
    } else if (slot2Type === 'hero' && card.heroFile) {
      customSrc = `/cards/Hero/${card.heroFile}.webp`;
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing w-full h-full flex items-center justify-center"
    >
      <CardIcon
        cardId={cardId}
        className="w-16 h-16"
        customSrc={customSrc}
      />
    </div>
  );
});

// Компонент слота – статичный, только droppable
const Slot = memo(({
  id,
  cardId,
  slotIndex,
  slot2Type,
  onRemove,
  onToggleSlot2,
  isDark,
}: {
  id: string;
  cardId: string | null;
  slotIndex: number;
  slot2Type: 'evo' | 'hero' | null;
  onRemove: () => void;
  onToggleSlot2?: () => void;
  isDark: boolean;
}) => {
  const { setNodeRef, isOver } = useDroppable({ id });

  const card = cardId ? ALL_CARDS_DATA.find(c => c.id === cardId) : null;
  const hasBoth = card && card.evoFile && card.heroFile;

  let borderColor = 'border-gray-300';
  if (slotIndex === 0) borderColor = 'border-purple-500 border-4';
  else if (slotIndex === 1) borderColor = 'border-yellow-500 border-4';
  else if (slotIndex === 2) {
    if (card?.champion) {
      borderColor = 'border-yellow-500 border-4';
    } else if (card?.evoFile && card?.heroFile) {
      borderColor = slot2Type === 'hero' ? 'border-yellow-500 border-4' : 'border-purple-500 border-4';
    } else if (card?.evoFile) {
      borderColor = 'border-purple-500 border-4';
    } else if (card?.heroFile) {
      borderColor = 'border-yellow-500 border-4';
    } else {
      borderColor = 'border-4 animate-borderGlow';
    }
  } else {
    borderColor = 'border-gray-300 border-2';
  }

  return (
    <div
      ref={setNodeRef}
      className={`relative w-20 h-24 rounded-lg flex flex-col items-center justify-center transition-colors duration-200 ${
        isDark ? 'bg-gray-700' : 'bg-gray-100'
      } ${borderColor} ${isOver ? 'ring-2 ring-blue-400' : ''}`}
    >
      {cardId ? (
        <>
          <DraggableCardInSlot cardId={cardId} slotIndex={slotIndex} slot2Type={slot2Type} isDark={isDark} />
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className={`absolute -top-1 -right-1 rounded-full w-4 h-4 flex items-center justify-center text-[8px] transition-colors ${
              isDark ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-red-500 hover:bg-red-600 text-white'
            }`}
          >
            <XMarkIcon className="w-3 h-3" />
          </button>
          {slotIndex === 2 && hasBoth && onToggleSlot2 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleSlot2(); }}
              className={`absolute -bottom-1 left-1/2 transform -translate-x-1/2 text-[8px] rounded-full px-1.5 py-0.5 border transition-colors ${
                isDark
                  ? 'bg-gray-600 border-gray-500 text-gray-200 hover:bg-gray-500'
                  : 'bg-gray-200 border-gray-400 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {slot2Type === 'evo' ? '⚡' : '🛡️'}
            </button>
          )}
        </>
      ) : (
        <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-400'}`}>Пусто</span>
      )}
    </div>
  );
});

// Компонент карты в коллекции (сортируется)
const SortableCard = memo(({
  id,
  cardId,
  isDark,
}: {
  id: string;
  cardId: string;
  isDark: boolean;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing flex-shrink-0 w-9 h-9 flex items-center justify-center rounded transition-colors duration-200 hover:bg-gray-200 dark:hover:bg-gray-600"
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
    >
      <CardIcon cardId={cardId} className="w-8 h-8" />
    </motion.div>
  );
});

const DeckBuilder: React.FC = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;

  const [slots, setSlots] = useState<(string | null)[]>(Array(8).fill(null));
  const [slot2Type, setSlot2Type] = useState<'evo' | 'hero' | null>(null);
  const [name, setName] = useState('');
  const [tier, setTier] = useState('');
  const [winRate, setWinRate] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [deckId, setDeckId] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newSourceName, setNewSourceName] = useState('');

  const availableCards = ALL_CARDS_DATA.filter(c => !slots.includes(c.id));

  const groupedCards: Record<Rarity, typeof ALL_CARDS_DATA> = {
    Common: [],
    Rare: [],
    Epic: [],
    Legendary: [],
    Champion: [],
  };
  availableCards.forEach(c => {
    if (groupedCards[c.rarity]) groupedCards[c.rarity].push(c);
  });

  // Загрузка категорий и источников
  const loadCategoriesAndSources = async () => {
    try {
      const [cats, srcs] = await Promise.all([getCategories(), getSources()]);
      setCategories(cats);
      setSources(srcs);
      if (cats.length > 0 && !categoryId) setCategoryId(cats[0].id);
      if (srcs.length > 0 && !sourceId) setSourceId(srcs[0].id);
    } catch (err) {
      console.error('Ошибка загрузки категорий/источников', err);
    }
  };

  useEffect(() => {
    loadCategoriesAndSources();
  }, []);

  // Загрузка данных колоды при редактировании
  useEffect(() => {
    if (isEdit && id) {
      const loadDeck = async () => {
        setLoading(true);
        try {
          const deck = await getMetaDeck(id);
          setDeckId(deck.id);
          setName(deck.name);
          setTier(deck.tier || '');
          setWinRate(deck.winRate ? String(deck.winRate) : '');
          setCategoryId(deck.categoryId);
          setSourceId(deck.sourceId);
          setSourceUrl(deck.sourceUrl || '');
          const cards = JSON.parse(deck.cards);
          const newSlots = [...Array(8).fill(null)];
          cards.forEach((card: string, idx: number) => {
            if (idx < 8) newSlots[idx] = card;
          });
          setSlots(newSlots);
          setSlot2Type(deck.slot2Type || null);
        } catch (err) {
          setError('Не удалось загрузить колоду');
          console.error(err);
        } finally {
          setLoading(false);
        }
      };
      loadDeck();
    }
  }, [isEdit, id]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setIsDragging(true);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setIsDragging(false);
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    if (activeId.startsWith('card-') && overId.startsWith('card-')) return;

    if (activeId.startsWith('card-')) {
      const cardId = activeId.replace('card-', '');
      const slotIndex = parseInt(overId.replace('slot-', ''), 10);
      if (isNaN(slotIndex) || slotIndex < 0 || slotIndex > 7) return;

      const card = ALL_CARDS_DATA.find(c => c.id === cardId);
      if (!card) return;

      if (card.champion && (slotIndex !== 1 && slotIndex !== 2)) {
        alert('Чемпионов можно ставить только во 2-й или 3-й слот');
        return;
      }

      const championCount = slots.filter(id => {
        const c = ALL_CARDS_DATA.find(card => card.id === id);
        return c?.champion;
      }).length;
      if (card.champion && championCount >= 2) {
        alert('В колоде не может быть более 2 чемпионов');
        return;
      }

      const newSlots = [...slots];
      if (slots[slotIndex] !== null) {
        newSlots[slotIndex] = cardId;
        setSlots(newSlots);
        if (slotIndex === 2) {
          const cardData = ALL_CARDS_DATA.find(c => c.id === cardId);
          if (cardData) {
            if (cardData.champion) setSlot2Type(null);
            else {
              const hasEvo = !!cardData.evoFile;
              const hasHero = !!cardData.heroFile;
              if (hasEvo && hasHero) setSlot2Type('evo');
              else if (hasEvo) setSlot2Type('evo');
              else if (hasHero) setSlot2Type('hero');
              else setSlot2Type(null);
            }
          }
        }
        return;
      }

      newSlots[slotIndex] = cardId;
      setSlots(newSlots);
      if (slotIndex === 2) {
        const cardData = ALL_CARDS_DATA.find(c => c.id === cardId);
        if (cardData) {
          if (cardData.champion) setSlot2Type(null);
          else {
            const hasEvo = !!cardData.evoFile;
            const hasHero = !!cardData.heroFile;
            if (hasEvo && hasHero) setSlot2Type('evo');
            else if (hasEvo) setSlot2Type('evo');
            else if (hasHero) setSlot2Type('hero');
            else setSlot2Type(null);
          }
        }
      }
      return;
    }

    if (activeId.startsWith('slot-card-') && overId.startsWith('slot-')) {
      const fromSlotIndex = parseInt(activeId.replace('slot-card-', ''), 10);
      const toSlotIndex = parseInt(overId.replace('slot-', ''), 10);
      if (isNaN(fromSlotIndex) || isNaN(toSlotIndex) || fromSlotIndex === toSlotIndex) return;

      const cardId = slots[fromSlotIndex];
      if (!cardId) return;

      const card = ALL_CARDS_DATA.find(c => c.id === cardId);
      if (!card) return;

      const targetCardId = slots[toSlotIndex];
      const targetCard = targetCardId ? ALL_CARDS_DATA.find(c => c.id === targetCardId) : null;

      const isChampionFrom = card.champion;
      const isChampionTo = targetCard?.champion || false;

      if (isChampionFrom && (toSlotIndex !== 1 && toSlotIndex !== 2)) {
        alert('Чемпионов можно ставить только во 2-й или 3-й слот');
        return;
      }
      if (isChampionTo && (fromSlotIndex !== 1 && fromSlotIndex !== 2)) {
        alert('Чемпион должен оставаться во 2-м или 3-м слоте');
        return;
      }

      const newSlots = [...slots];
      newSlots[fromSlotIndex] = slots[toSlotIndex];
      newSlots[toSlotIndex] = slots[fromSlotIndex];

      const championIndices = newSlots
        .map((id, idx) => ({ id, idx }))
        .filter(item => {
          if (!item.id) return false;
          const c = ALL_CARDS_DATA.find(card => card.id === item.id);
          return c?.champion;
        })
        .map(item => item.idx);

      const hasInvalidChampion = championIndices.some(idx => idx !== 1 && idx !== 2);
      if (hasInvalidChampion) {
        alert('Чемпионы могут находиться только во 2-м и 3-м слотах');
        return;
      }

      const championCountAfter = championIndices.length;
      if (championCountAfter > 2) {
        alert('В колоде не может быть более 2 чемпионов');
        return;
      }

      setSlots(newSlots);
      if (toSlotIndex === 2 || fromSlotIndex === 2) {
        const slot2Card = newSlots[2];
        if (slot2Card) {
          const cardData = ALL_CARDS_DATA.find(c => c.id === slot2Card);
          if (cardData) {
            if (cardData.champion) setSlot2Type(null);
            else {
              const hasEvo = !!cardData.evoFile;
              const hasHero = !!cardData.heroFile;
              if (hasEvo && hasHero) setSlot2Type('evo');
              else if (hasEvo) setSlot2Type('evo');
              else if (hasHero) setSlot2Type('hero');
              else setSlot2Type(null);
            }
          }
        } else {
          setSlot2Type(null);
        }
      }
      return;
    }
  };

  const handleCardClick = (cardId: string) => {
    if (isDragging) return;
    const card = ALL_CARDS_DATA.find(c => c.id === cardId);
    if (!card) return;

    let targetIndex = -1;
    for (let i = 0; i < 8; i++) {
      if (slots[i] === null) {
        targetIndex = i;
        break;
      }
    }
    if (targetIndex === -1) {
      alert('Все слоты заполнены');
      return;
    }

    if (card.champion && (targetIndex !== 1 && targetIndex !== 2)) {
      alert('Чемпионов можно ставить только во 2-й или 3-й слот');
      return;
    }

    const championCount = slots.filter(id => {
      const c = ALL_CARDS_DATA.find(card => card.id === id);
      return c?.champion;
    }).length;
    if (card.champion && championCount >= 2) {
      alert('В колоде не может быть более 2 чемпионов');
      return;
    }

    const newSlots = [...slots];
    newSlots[targetIndex] = cardId;
    setSlots(newSlots);

    if (targetIndex === 2) {
      const cardData = ALL_CARDS_DATA.find(c => c.id === cardId);
      if (cardData) {
        if (cardData.champion) setSlot2Type(null);
        else {
          const hasEvo = !!cardData.evoFile;
          const hasHero = !!cardData.heroFile;
          if (hasEvo && hasHero) setSlot2Type('evo');
          else if (hasEvo) setSlot2Type('evo');
          else if (hasHero) setSlot2Type('hero');
          else setSlot2Type(null);
        }
      }
    }
  };

  const handleRemoveFromSlot = useCallback((index: number) => {
    const newSlots = [...slots];
    newSlots[index] = null;
    setSlots(newSlots);
    if (index === 2) setSlot2Type(null);
  }, [slots]);

  const handleToggleSlot2 = useCallback(() => {
    setSlot2Type(prev => {
      if (prev === 'evo') return 'hero';
      if (prev === 'hero') return 'evo';
      return 'evo';
    });
  }, []);

  // Обработчики для категорий
  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      const created = await createCategory(newCategoryName.trim());
      setCategories([...categories, created]);
      setCategoryId(created.id);
      setNewCategoryName('');
    } catch (err) {
      alert('Ошибка создания категории');
    }
  };

  const handleDeleteCategory = async () => {
    if (!categoryId) return;
    if (!confirm('Удалить категорию? Это можно сделать, только если к ней не привязаны колоды.')) return;
    try {
      await deleteCategory(categoryId);
      setCategories(categories.filter(c => c.id !== categoryId));
      if (categories.length > 1) {
        setCategoryId(categories.find(c => c.id !== categoryId)?.id || categories[0]?.id || '');
      } else {
        setCategoryId('');
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Ошибка удаления категории');
    }
  };

  // Обработчики для источников
  const handleCreateSource = async () => {
    if (!newSourceName.trim()) return;
    try {
      const created = await createSource(newSourceName.trim());
      setSources([...sources, created]);
      setSourceId(created.id);
      setNewSourceName('');
    } catch (err) {
      alert('Ошибка создания источника');
    }
  };

  const handleDeleteSource = async () => {
    if (!sourceId) return;
    if (!confirm('Удалить источник? Это можно сделать, только если к нему не привязаны колоды.')) return;
    try {
      await deleteSource(sourceId);
      setSources(sources.filter(s => s.id !== sourceId));
      if (sources.length > 1) {
        setSourceId(sources.find(s => s.id !== sourceId)?.id || sources[0]?.id || '');
      } else {
        setSourceId('');
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Ошибка удаления источника');
    }
  };

  // Сохранение/обновление
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || slots.some(s => s === null)) {
      setError('Заполните название и выберите все 8 карт');
      return;
    }
    const championCards = slots.filter(id => {
      const c = ALL_CARDS_DATA.find(card => card.id === id);
      return c?.champion;
    });
    if (championCards.length > 2) {
      setError('В колоде не может быть более 2 чемпионов');
      return;
    }
    const slot2CardId = slots[2];
    if (slot2CardId) {
      const card = ALL_CARDS_DATA.find(c => c.id === slot2CardId);
      if (card && card.evoFile && card.heroFile && !slot2Type) {
        setError('Для третьего слота выберите тип: эволюция или герой');
        return;
      }
    }
    if (!categoryId || !sourceId) {
      setError('Выберите категорию и источник');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const data = {
        name: name.trim(),
        cards: slots.filter((id): id is string => id !== null),
        slot2Type: slot2Type || undefined,
        tier: tier || undefined,
        winRate: winRate ? parseFloat(winRate) : undefined,
        categoryId,
        sourceId,
        sourceUrl: sourceUrl || undefined,
      };
      if (isEdit && deckId) {
        await updateMetaDeck(deckId, data);
      } else {
        await createMetaDeck(data);
      }
      navigate('/decks');
    } catch (err) {
      setError(isEdit ? 'Ошибка обновления колоды' : 'Ошибка сохранения колоды');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deckId) return;
    if (!confirm('Удалить колоду?')) return;
    try {
      await deleteMetaDeck(deckId);
      navigate('/decks');
    } catch (err) {
      setError('Ошибка удаления колоды');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`max-w-7xl mx-auto transition-colors duration-200 ${
        isDark ? 'text-gray-200' : 'text-gray-900'
      }`}
    >
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => navigate('/decks')}
          className={`flex items-center gap-1 text-sm transition-colors ${
            isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <ArrowLeftIcon className="w-4 h-4" /> Назад
        </button>
        <h2 className="text-2xl font-bold">{isEdit ? 'Редактировать' : 'Создать'} мета-колоду</h2>
      </div>

      <form onSubmit={handleSubmit} className={`p-4 rounded-lg shadow transition-colors duration-200 ${
        isDark ? 'bg-gray-800' : 'bg-white'
      }`}>
        <div className="mb-4">
          <label className={`block font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
            Название
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`w-full rounded px-3 py-2 transition-colors duration-200 ${
              isDark
                ? 'bg-gray-700 border-gray-600 text-gray-200 focus:border-blue-400'
                : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
            } border focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
            required
          />
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-wrap gap-4">
            <div className="flex-shrink-0">
              <div className="grid grid-cols-4 gap-0.5">
                {slots.map((cardId, idx) => (
                  <Slot
                    key={`slot-${idx}`}
                    id={`slot-${idx}`}
                    cardId={cardId}
                    slotIndex={idx}
                    slot2Type={slot2Type}
                    onRemove={() => handleRemoveFromSlot(idx)}
                    onToggleSlot2={idx === 2 ? handleToggleSlot2 : undefined}
                    isDark={isDark}
                  />
                ))}
              </div>
            </div>

            <div className="flex-1 min-w-[200px]">
              {(['Common', 'Rare'] as Rarity[]).map(rarity => {
                const cards = groupedCards[rarity] || [];
                if (cards.length === 0) return null;
                const cardIds = cards.map(c => `card-${c.id}`);
                return (
                  <div key={rarity} className="mb-1">
                    <div className={`text-[10px] font-semibold ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {rarity}
                    </div>
                    <div className="flex flex-wrap gap-0">
                      <SortableContext items={cardIds} strategy={rectSortingStrategy}>
                        {cards.map(c => (
                          <SortableCard key={`card-${c.id}`} id={`card-${c.id}`} cardId={c.id} isDark={isDark} />
                        ))}
                      </SortableContext>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-2 border-t pt-2 border-gray-300 dark:border-gray-600">
            <div className="flex flex-wrap gap-4">
              {(['Epic', 'Legendary', 'Champion'] as Rarity[]).map(rarity => {
                const cards = groupedCards[rarity] || [];
                if (cards.length === 0) return null;
                const cardIds = cards.map(c => `card-${c.id}`);
                return (
                  <div key={rarity} className="flex-1 min-w-[200px]">
                    <div className={`text-[10px] font-semibold ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {rarity}
                    </div>
                    <div className="flex flex-wrap gap-0">
                      <SortableContext items={cardIds} strategy={rectSortingStrategy}>
                        {cards.map(c => (
                          <SortableCard key={`card-${c.id}`} id={`card-${c.id}`} cardId={c.id} isDark={isDark} />
                        ))}
                      </SortableContext>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </DndContext>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <label className={`block font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Тир
            </label>
            <input
              type="text"
              value={tier}
              onChange={(e) => setTier(e.target.value)}
              className={`w-full rounded px-3 py-2 transition-colors duration-200 ${
                isDark
                  ? 'bg-gray-700 border-gray-600 text-gray-200 focus:border-blue-400'
                  : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
              } border focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
              placeholder="S, A, B, C"
            />
          </div>
          <div>
            <label className={`block font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Винрейт %
            </label>
            <input
              type="number"
              step="0.1"
              value={winRate}
              onChange={(e) => setWinRate(e.target.value)}
              className={`w-full rounded px-3 py-2 transition-colors duration-200 ${
                isDark
                  ? 'bg-gray-700 border-gray-600 text-gray-200 focus:border-blue-400'
                  : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
              } border focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
              placeholder="52.5"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <label className={`block font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Категория
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className={`flex-1 rounded px-3 py-2 transition-colors duration-200 ${
                  isDark
                    ? 'bg-gray-700 border-gray-600 text-gray-200 focus:border-blue-400'
                    : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
                } border focus:outline-none`}
              >
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Новая"
                className={`w-28 rounded px-2 py-2 text-sm transition-colors duration-200 ${
                  isDark
                    ? 'bg-gray-700 border-gray-600 text-gray-200 focus:border-blue-400'
                    : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
                } border focus:outline-none`}
              />
              <button
                type="button"
                onClick={handleCreateCategory}
                className="bg-green-500 text-white px-3 py-2 rounded text-sm hover:bg-green-600 transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleDeleteCategory}
                className="bg-red-500 text-white px-3 py-2 rounded text-sm hover:bg-red-600 transition-colors"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div>
            <label className={`block font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Источник
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                className={`flex-1 rounded px-3 py-2 transition-colors duration-200 ${
                  isDark
                    ? 'bg-gray-700 border-gray-600 text-gray-200 focus:border-blue-400'
                    : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
                } border focus:outline-none`}
              >
                {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input
                type="text"
                value={newSourceName}
                onChange={(e) => setNewSourceName(e.target.value)}
                placeholder="Новый"
                className={`w-28 rounded px-2 py-2 text-sm transition-colors duration-200 ${
                  isDark
                    ? 'bg-gray-700 border-gray-600 text-gray-200 focus:border-blue-400'
                    : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
                } border focus:outline-none`}
              />
              <button
                type="button"
                onClick={handleCreateSource}
                className="bg-green-500 text-white px-3 py-2 rounded text-sm hover:bg-green-600 transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleDeleteSource}
                className="bg-red-500 text-white px-3 py-2 rounded text-sm hover:bg-red-600 transition-colors"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <label className={`block font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
            Ссылка на источник
          </label>
          <input
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            className={`w-full rounded px-3 py-2 transition-colors duration-200 ${
              isDark
                ? 'bg-gray-700 border-gray-600 text-gray-200 focus:border-blue-400'
                : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
            } border focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
            placeholder="https://..."
          />
        </div>

        {error && (
          <div className={`mt-4 p-3 rounded-lg ${isDark ? 'bg-red-900/50 text-red-300' : 'bg-red-100 text-red-600'}`}>
            {error}
          </div>
        )}

        <div className="flex gap-3 mt-4">
          <button
            type="submit"
            disabled={loading}
            className={`flex items-center gap-2 px-6 py-2 rounded transition-all duration-200 ${
              loading ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-lg transform hover:scale-105'
            } ${isDark ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
          >
            <CheckIcon className="w-4 h-4" />
            {loading ? (isEdit ? 'Обновление...' : 'Сохранение...') : (isEdit ? 'Обновить' : 'Сохранить')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/decks')}
            className={`px-6 py-2 rounded transition-colors ${
              isDark
                ? 'bg-gray-600 hover:bg-gray-500 text-gray-200'
                : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
            }`}
          >
            Отмена
          </button>
          {isEdit && (
            <button
              type="button"
              onClick={handleDelete}
              className={`flex items-center gap-1 px-6 py-2 rounded transition-colors ${
                isDark
                  ? 'bg-red-700 hover:bg-red-600 text-white'
                  : 'bg-red-600 hover:bg-red-700 text-white'
              }`}
            >
              <TrashIcon className="w-4 h-4" />
              Удалить
            </button>
          )}
        </div>
      </form>
    </motion.div>
  );
};

export default DeckBuilder;
