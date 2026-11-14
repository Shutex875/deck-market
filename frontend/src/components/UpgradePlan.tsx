import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  ['', 'Одна колода'],
  ['/budget', 'По бюджету'],
  ['/clan-war', 'Четыре для КВ'],
  ['/shared-cards', 'Общие карты'],
];

export default function UpgradePlan() {
  return (
    <section>
      <h1 className="mb-4 text-2xl font-bold">План прокачки</h1>
      <nav aria-label="Разделы плана прокачки" className="mb-6 flex flex-wrap gap-2">
        {tabs.map(([path, title]) => (
          <NavLink key={path} end to={`/upgrade-plan${path}`}
            className={({ isActive }) => `rounded-md px-3 py-2 text-sm font-medium ${
              isActive ? 'bg-blue-700 text-white' : 'bg-white hover:bg-blue-50 dark:bg-gray-800 dark:hover:bg-gray-700'
            }`}>
            {title}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </section>
  );
}
