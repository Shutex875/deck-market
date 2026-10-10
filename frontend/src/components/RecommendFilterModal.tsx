import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Dialog from '@radix-ui/react-dialog';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { ALL_CARDS_DATA } from '../data/cards';
import { CardIcon } from '../utils/cardImages';

interface RecommendFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (include: string[], exclude: string[]) => void;
  onClear: () => void;
  initialInclude: string[];
  initialExclude: string[];
  isDark: boolean;
  maxCards?: number; // максимальное количество карт в каждой группе, по умолчанию 4
}

type CardStatus = 'none' | 'include' | 'exclude';

const RecommendFilterModal: React.FC<RecommendFilterModalProps> = ({
  isOpen,
  onClose,
  onApply,
  onClear,
  initialInclude,
  initialExclude,
  isDark,
  maxCards = 4,
}) => {
  const [cardStatus, setCardStatus] = useState<Record<string, CardStatus>>({});

  useEffect(() => {
    if (isOpen) {
      const initialStatus: Record<string, CardStatus> = {};
      ALL_CARDS_DATA.forEach(card => {
        if (initialInclude.includes(card.id)) {
          initialStatus[card.id] = 'include';
        } else if (initialExclude.includes(card.id)) {
          initialStatus[card.id] = 'exclude';
        } else {
          initialStatus[card.id] = 'none';
        }
      });
      setCardStatus(initialStatus);
    }
  }, [isOpen, initialInclude, initialExclude]);

  const handleCardClick = (cardId: string) => {
    setCardStatus(prev => {
      const current = prev[cardId];
      const includeCount = Object.values(prev).filter(v => v === 'include').length;
      const excludeCount = Object.values(prev).filter(v => v === 'exclude').length;

      let newStatus: CardStatus;
      if (current === 'none') {
        if (includeCount < maxCards) {
          newStatus = 'include';
        } else if (excludeCount < maxCards) {
          newStatus = 'exclude';
        } else {
          alert(`Максимум ${maxCards} карт в каждой группе`);
          return prev;
        }
      } else if (current === 'include') {
        if (excludeCount < maxCards) {
          newStatus = 'exclude';
        } else {
          newStatus = 'none';
        }
      } else { // current === 'exclude'
        newStatus = 'none';
      }
      return { ...prev, [cardId]: newStatus };
    });
  };

  const getCounts = () => {
    const includeCount = Object.values(cardStatus).filter(v => v === 'include').length;
    const excludeCount = Object.values(cardStatus).filter(v => v === 'exclude').length;
    return { includeCount, excludeCount };
  };

  const { includeCount, excludeCount } = getCounts();

  const handleApply = () => {
    const include = Object.keys(cardStatus).filter(id => cardStatus[id] === 'include');
    const exclude = Object.keys(cardStatus).filter(id => cardStatus[id] === 'exclude');
    onApply(include, exclude);
  };

  const handleClear = () => {
    onClear();
    setCardStatus(prev => {
      const reset: Record<string, CardStatus> = {};
      Object.keys(prev).forEach(key => { reset[key] = 'none'; });
      return reset;
    });
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <AnimatePresence>
        {isOpen && (
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
                className={`max-w-4xl w-full max-h-[90vh] rounded-lg shadow-xl p-6 overflow-y-auto ${
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

                <Dialog.Title className="text-xl font-bold mb-4">
                  Фильтр по картам
                </Dialog.Title>

                <div className="flex flex-wrap items-center gap-4 mb-4 text-sm">
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 bg-blue-500/50 rounded"></span>
                    Обязательные: {includeCount}/{maxCards}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 bg-red-500/50 rounded"></span>
                    Исключённые: {excludeCount}/{maxCards}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    (клик: нет → синий → красный → нет)
                  </span>
                </div>

                <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-1.5 mb-4">
                  {ALL_CARDS_DATA.map(card => {
                    const status = cardStatus[card.id] || 'none';
                    let overlayClass = '';
                    let overlayContent = null;
                    if (status === 'include') {
                      overlayClass = 'bg-blue-500/30';
                      overlayContent = (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-blue-600 dark:text-blue-300 text-xs font-bold">✓</span>
                        </div>
                      );
                    } else if (status === 'exclude') {
                      overlayClass = 'bg-red-500/30';
                      overlayContent = (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-red-600 dark:text-red-300 text-xs font-bold">✕</span>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={card.id}
                        onClick={() => handleCardClick(card.id)}
                        className="relative flex flex-col items-center rounded border border-gray-300 dark:border-gray-600 cursor-pointer transition-colors hover:border-blue-400 dark:hover:border-blue-400 overflow-hidden"
                        style={{ aspectRatio: '1 / 1' }}
                        title={card.name}
                      >
                        <CardIcon cardId={card.id} className="w-full h-full p-1" />
                        {overlayClass && (
                          <div className={`absolute inset-0 ${overlayClass} pointer-events-none`}>
                            {overlayContent}
                          </div>
                        )}
                        <span className="absolute bottom-0 left-0 right-0 text-[7px] text-center bg-black/50 text-white truncate px-0.5 leading-tight">
                          {card.name}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end gap-3 mt-4">
                  <button
                    onClick={handleClear}
                    className={`px-4 py-2 rounded transition-colors ${
                      isDark
                        ? 'bg-gray-600 hover:bg-gray-500 text-gray-200'
                        : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
                    }`}
                  >
                    Сбросить
                  </button>
                  <button
                    onClick={handleApply}
                    className={`px-4 py-2 rounded transition-colors ${
                      isDark
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    Применить
                  </button>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
};

export default RecommendFilterModal;
