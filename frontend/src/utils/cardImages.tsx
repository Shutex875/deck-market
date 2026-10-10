import { ALL_CARDS_DATA } from '../data/cards';
import React, { useState } from 'react';
import { cardTranslations } from './cardTranslations';

export const cardImageMap: Record<string, string> = {};
ALL_CARDS_DATA.forEach(c => {
  cardImageMap[c.id] = c.file;
});

export const getImageUrls = (basePath: string, fileName: string): string[] => {
  const webp = `${basePath}/${fileName}.webp`;
  const png = `${basePath}/${fileName}.png`;
  return [webp, png];
};

interface CardIconProps {
  cardId: string;
  className?: string;
  alt?: string;
  customSrc?: string;
}

export const CardIcon: React.FC<CardIconProps> = ({ cardId, className = 'w-8 h-8', alt, customSrc }) => {
  const file = cardImageMap[cardId] || cardId;
  const defaultWebp = `/cards/${file}.webp`;
  const defaultPng = `/cards/${file}.png`;

  // Построим список URL для попыток
  const urls: string[] = [];
  if (customSrc) {
    urls.push(customSrc);
    if (customSrc.endsWith('.webp')) {
      urls.push(customSrc.replace('.webp', '.png'));
    } else if (customSrc.endsWith('.png')) {
      urls.push(customSrc.replace('.png', '.webp'));
    }
  }
  urls.push(defaultWebp);
  urls.push(defaultPng);

  // Убираем дубликаты
  const uniqueUrls = Array.from(new Set(urls));

  const [currentSrcIndex, setCurrentSrcIndex] = useState(0);
  const currentSrc = uniqueUrls[currentSrcIndex];

  const handleError = () => {
    if (currentSrcIndex < uniqueUrls.length - 1) {
      setCurrentSrcIndex(currentSrcIndex + 1);
    }
    // если все попытки исчерпаны – просто оставляем последний, изображение будет скрыто
  };

  const name = alt || cardTranslations[cardId] || cardId;

  return (
    <img
      src={currentSrc}
      alt={name}
      className={`object-contain ${className}`}
      onError={handleError}
      title={name}
    />
  );
};
