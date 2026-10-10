import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeftIcon, CheckIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { createMetaDeck, getCategories, getSources, Category, Source } from '../api';
import { ALL_CARDS_DATA } from '../data/cards';
import { cardTranslations } from '../utils/cardTranslations';
import { CardIcon } from '../utils/cardImages';
import { useTheme } from '../context/ThemeContext';

const DeckForm: React.FC = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const navigate = useNavigate();

  const [cards, setCards] = useState<string[]>(Array(8).fill(''));
  const [slot2Type, setSlot2Type] = useState<'evo' | 'hero' | null>(null); // теперь относится к слоту 2 (индекс 2)
  const [tier, setTier] = useState('');
  const [winRate, setWinRate] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [categories, setCategories] = useState<Category[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newSourceName, setNewSourceName] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [cats, srcs] = await Promise.all([getCategories(), getSources()]);
        setCategories(cats);
        setSources(srcs);
        if (cats.length > 0) setCategoryId(cats[0].id);
        if (srcs.length > 0) setSourceId(srcs[0].id);
      } catch (err) {
        console.error('Ошибка загрузки категорий/источников', err);
      }
    };
    fetchData();
  }, []);

  const handleCardSelect = (index: number, cardId: string) => {
    const newCards = [...cards];
    if (cards.includes(cardId) && cards.indexOf(cardId) !== index) {
      alert('Эта карта уже выбрана');
      return;
    }
    newCards[index] = cardId;
    setCards(newCards);
    if (index === 2) {
      const card = ALL_CARDS_DATA.find(c => c.id === cardId);
      if (card) {
        const hasEvo = !!card.evoFile;
        const hasHero = !!card.heroFile;
        if (!hasEvo && !hasHero) setSlot2Type(null);
        else if (hasEvo && !hasHero) setSlot2Type('evo');
        else if (!hasEvo && hasHero) setSlot2Type('hero');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || cards.some(c => !c)) {
      setError('Заполните название и выберите все 8 карт');
      return;
    }
    const championCards = cards.filter(cardId => {
      const card = ALL_CARDS_DATA.find(c => c.id === cardId);
      return card?.champion;
    });
    if (championCards.length > 2) {
      setError('В колоде не может быть более 2 чемпионов');
      return;
    }
    const slot2CardId = cards[2];
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
      await createMetaDeck({
        name: name.trim(),
        cards,
        slot2Type: slot2Type || undefined,
        tier: tier || undefined,
        winRate: winRate ? parseFloat(winRate) : undefined,
        categoryId,
        sourceId,
        sourceUrl: sourceUrl || undefined,
      });
      navigate('/decks');
    } catch (err) {
      setError('Ошибка сохранения колоды');
    } finally {
      setLoading(false);
    }
  };

  const renderCardSelect = (index: number, label: string) => {
    const selected = cards[index] || '';
    return (
      <div className="flex flex-col items-center">
        <label className={`block font-medium text-sm mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
          {label}
        </label>
        <select
          value={selected}
          onChange={(e) => handleCardSelect(index, e.target.value)}
          className={`w-full rounded px-2 py-1 transition-colors duration-200 ${
            isDark
              ? 'bg-gray-700 border-gray-600 text-gray-200 focus:border-blue-400'
              : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
          } border focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
        >
          <option value="">— Выберите карту —</option>
          {ALL_CARDS_DATA.map(card => (
            <option key={card.id} value={card.id} disabled={cards.includes(card.id) && cards.indexOf(card.id) !== index}>
              {cardTranslations[card.id] || card.id}
            </option>
          ))}
        </select>
        {selected && <CardIcon cardId={selected} className="w-10 h-10 mt-1" />}
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`max-w-4xl mx-auto transition-colors duration-200 ${
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
        <h2 className="text-2xl font-bold">Добавить мета-колоду</h2>
      </div>

      <form onSubmit={handleSubmit} className={`p-6 rounded-lg shadow space-y-4 transition-colors duration-200 ${
        isDark ? 'bg-gray-800' : 'bg-white'
      }`}>
        <div>
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

        <div>
          <h3 className={`font-semibold text-lg mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
            Специальные слоты (первые 3 карты)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {renderCardSelect(0, 'Слот 1 (эво)')}
            {renderCardSelect(1, 'Слот 2 (герой)')}
            <div>
              {renderCardSelect(2, 'Слот 3 (безумный)')}
              {cards[2] && (
                <div className="mt-2 flex gap-2 justify-center">
                  {ALL_CARDS_DATA.find(c => c.id === cards[2])?.evoFile && (
                    <label className="flex items-center gap-1 text-sm">
                      <input
                        type="radio"
                        name="slot2Type"
                        value="evo"
                        checked={slot2Type === 'evo'}
                        onChange={() => setSlot2Type('evo')}
                        className="accent-blue-500"
                      />
                      <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>Эво</span>
                    </label>
                  )}
                  {ALL_CARDS_DATA.find(c => c.id === cards[2])?.heroFile && (
                    <label className="flex items-center gap-1 text-sm">
                      <input
                        type="radio"
                        name="slot2Type"
                        value="hero"
                        checked={slot2Type === 'hero'}
                        onChange={() => setSlot2Type('hero')}
                        className="accent-blue-500"
                      />
                      <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>Герой</span>
                    </label>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div>
          <h3 className={`font-semibold text-lg mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
            Обычные карты (5 карт)
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {[3, 4, 5, 6, 7].map(i => renderCardSelect(i, `Карта ${i-2}`))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              className="bg-green-500 text-white px-3 py-2 rounded text-sm hover:bg-green-600 transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
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
              className="bg-green-500 text-white px-3 py-2 rounded text-sm hover:bg-green-600 transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="bg-red-500 text-white px-3 py-2 rounded text-sm hover:bg-red-600 transition-colors"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div>
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
          <div className={`p-3 rounded-lg ${isDark ? 'bg-red-900/50 text-red-300' : 'bg-red-100 text-red-600'}`}>
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className={`flex items-center gap-2 px-6 py-2 rounded transition-all duration-200 ${
              loading ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-lg transform hover:scale-105'
            } ${isDark ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
          >
            <CheckIcon className="w-4 h-4" />
            {loading ? 'Сохранение...' : 'Сохранить'}
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
        </div>
      </form>
    </motion.div>
  );
};

export default DeckForm;
