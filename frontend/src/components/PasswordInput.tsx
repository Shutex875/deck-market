import { useEffect, useId, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';

type PasswordInputProps = Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'id'> & {
  label: string;
  hint?: ReactNode;
  submitting: boolean;
};

export default function PasswordInput({ label, hint, submitting, className, ...input }: PasswordInputProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (submitting) setVisible(false);
  }, [submitting]);

  const shown = visible && !submitting;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block font-medium">{label}</label>
      <div className="relative">
        <input {...input} id={id} type={shown ? 'text' : 'password'} spellCheck={false}
          aria-describedby={hint ? `${id}-hint` : input['aria-describedby']}
          className={`${className ?? ''} pr-12`} />
        <button type="button" aria-controls={id}
          aria-label={`${shown ? 'Скрыть пароль' : 'Показать пароль'}: ${label.toLowerCase()}`}
          disabled={submitting || input.disabled}
          onClick={() => setVisible(value => !value)}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-md text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
          {shown ? <EyeSlashIcon className="h-5 w-5" aria-hidden="true" /> : <EyeIcon className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>
      {hint && <p id={`${id}-hint`} className="text-sm text-gray-600 dark:text-gray-400">{hint}</p>}
    </div>
  );
}
