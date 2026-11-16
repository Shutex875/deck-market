import { Link } from 'react-router-dom';
import type { Player } from '../api';

export const playerResourcesPath = (name: string) => `/players/edit/${encodeURIComponent(name)}?tab=resources`;

export default function PlayerResourceLink({ player, used = true }: { player?: Player; used?: boolean }) {
  if (!player) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-sm">
      {used ? 'Ресурсы аккаунта' : 'Игровой аккаунт'} <strong>{player.name}</strong>
      <Link to={playerResourcesPath(player.name)} className="text-blue-700 underline dark:text-blue-300">
        Изменить ресурсы
      </Link>
    </p>
  );
}
