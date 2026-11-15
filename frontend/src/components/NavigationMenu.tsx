import { useRef, type ReactNode } from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';

export default function NavigationMenu({ label, children, align = 'left' }: {
  label: ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const close = () => { if (menu.current) menu.current.open = false; };

  return (
    <details ref={menu} className="relative" onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) close();
    }} onKeyDown={event => {
      if (event.key === 'Escape' && menu.current?.open) {
        close();
        summary.current?.focus();
      }
    }}>
      <summary ref={summary} className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:hover:bg-gray-700 [&::-webkit-details-marker]:hidden">
        {label}
        <ChevronDownIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </summary>
      <div className={`absolute top-full z-30 mt-1 grid w-max min-w-40 gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-gray-700 dark:bg-gray-800 ${
        align === 'right' ? 'right-0' : 'left-0'
      }`} onClick={close}>
        {children}
      </div>
    </details>
  );
}
