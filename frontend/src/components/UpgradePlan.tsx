import { NavLink, Outlet } from 'react-router-dom';
import NavigationMenu from './NavigationMenu';

const tabClass = ({ isActive }: { isActive: boolean }) => `rounded-lg px-3 py-2 text-sm font-medium ${
  isActive ? 'bg-blue-700 text-white' : 'hover:bg-slate-100 dark:hover:bg-gray-700'
}`;

export default function UpgradePlan() {
  return (
    <section>
      <h1 className="mb-4 text-2xl font-bold tracking-tight">План прокачки</h1>
      <nav aria-label="Разделы плана прокачки" className="mb-5 flex w-fit max-w-full flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-800">
        <NavLink end to="/upgrade-plan" className={tabClass}>Одна колода</NavLink>
        <NavLink to="/upgrade-plan/clan-war" className={tabClass}>Четыре для КВ</NavLink>
        <NavigationMenu label="Другие планы">
          <NavLink to="/upgrade-plan/budget" className={tabClass}>По бюджету</NavLink>
          <NavLink to="/upgrade-plan/shared-cards" className={tabClass}>Общие карты</NavLink>
        </NavigationMenu>
      </nav>
      <Outlet />
    </section>
  );
}
