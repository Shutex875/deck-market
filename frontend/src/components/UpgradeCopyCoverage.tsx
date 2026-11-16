import type { UpgradeResourceSummary } from '../api';

export default function UpgradeCopyCoverage({ neededCopies, wildcardsCovered, uncoveredCopies }: Pick<
  UpgradeResourceSummary, 'neededCopies' | 'wildcardsCovered' | 'uncoveredCopies'
>) {
  return (
    <p className="text-sm">
      Требуется копий: {neededCopies.toLocaleString('ru-RU')} · Покрыто джокерами: {wildcardsCovered.toLocaleString('ru-RU')}
      {' · '}Не покрыто джокерами: {uncoveredCopies.toLocaleString('ru-RU')}
    </p>
  );
}
