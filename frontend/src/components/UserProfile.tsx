import { useState, type FormEvent } from 'react';
import { SessionRequestError, updateProfile, type UserSession } from '../api/session';
import { useTheme } from '../context/ThemeContext';
import PasswordInput from './PasswordInput';

export default function UserProfile({ user, onUpdate }: {
  user: UserSession;
  onUpdate: (user: UserSession) => void;
}) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [username, setUsername] = useState(user.username);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const hasChanges = username.trim() !== user.username || Boolean(newPassword || confirmation);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasChanges || saving) return;
    setError('');
    setNotice('');
    if (newPassword !== confirmation) {
      setError('Новые пароли не совпадают.');
      return;
    }

    setSaving(true);
    try {
      const updated = await updateProfile({ username, currentPassword, newPassword: newPassword || undefined });
      onUpdate(updated);
      setUsername(updated.username);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
      setNotice(newPassword ? 'Пароль обновлён. Остальные сессии завершены.' : 'Логин обновлён.');
    } catch (error) {
      setError(error instanceof SessionRequestError && error.message
        ? error.message
        : 'Не удалось сохранить профиль. Попробуйте снова.');
    } finally {
      setSaving(false);
    }
  };

  const fieldClass = `w-full rounded-md border px-3 py-2 ${isDark
    ? 'border-gray-600 bg-gray-900' : 'border-gray-300 bg-white'}`;

  return (
    <main className="mx-auto max-w-lg">
      <h1 className="mb-4 text-2xl font-bold">Настройки профиля</h1>
      <form onSubmit={submit} className={`rounded-lg p-5 shadow ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
        <fieldset disabled={saving} className="space-y-4">
          <label className="block space-y-1">
            <span className="font-medium">Логин</span>
            <input value={username} onChange={event => setUsername(event.target.value)} required
              minLength={3} maxLength={32} autoComplete="username" className={fieldClass} />
          </label>
          <PasswordInput label="Текущий пароль" submitting={saving} value={currentPassword}
            onChange={event => setCurrentPassword(event.target.value)}
            required maxLength={128} autoComplete="current-password" className={fieldClass} />
          <PasswordInput label="Новый пароль" submitting={saving} value={newPassword}
            onChange={event => setNewPassword(event.target.value)}
            minLength={8} maxLength={128} autoComplete="new-password" className={fieldClass}
            hint="От 8 символов. Оставьте поле пустым, чтобы сохранить текущий пароль." />
          <PasswordInput label="Повторите новый пароль" submitting={saving} value={confirmation}
            onChange={event => setConfirmation(event.target.value)}
            required={Boolean(newPassword)} maxLength={128} autoComplete="new-password" className={fieldClass} />
          {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
          {notice && <p role="status" className="text-sm text-green-700 dark:text-green-400">{notice}</p>}
          <button type="submit" disabled={!hasChanges || saving}
            className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Сохранение…' : 'Сохранить изменения'}
          </button>
        </fieldset>
      </form>
    </main>
  );
}
