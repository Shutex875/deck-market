import { useId } from 'react';
import { Link } from 'react-router-dom';
import type { Player } from '../api';
import { useTheme } from '../context/ThemeContext';

export default function ProfileSwitcher({ profiles, value, onChange, className }: {
  profiles: Player[];
  value: string;
  onChange: (name: string) => void;
  className?: string;
}) {
  const id = useId();
  const { theme } = useTheme();
  if (profiles.length === 1) return null;
  if (!profiles.length) {
    return <Link to="/players/new" className="text-sm text-blue-600 underline dark:text-blue-400">Добавить игровой аккаунт</Link>;
  }
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block font-medium">Игровой аккаунт</label>
      <select id={id} value={value} onChange={event => onChange(event.target.value)}
        className={`w-full rounded border px-3 py-2 ${theme === 'dark'
          ? 'border-gray-600 bg-gray-700 text-gray-200'
          : 'border-gray-300 bg-white text-gray-900'}`}>
        {profiles.map(profile => <option key={profile.id} value={profile.name}>{profile.name}</option>)}
      </select>
    </div>
  );
}
