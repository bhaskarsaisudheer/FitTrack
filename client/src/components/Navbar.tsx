import { Dumbbell, History, LayoutDashboard, LineChart, ListChecks } from 'lucide-react';
import { NavLink } from 'react-router-dom';

const links = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/workout', label: 'Workout', icon: Dumbbell, end: false },
  { to: '/history', label: 'History', icon: History, end: false },
  { to: '/progress', label: 'Progress', icon: LineChart, end: false },
  { to: '/exercises', label: 'Library', icon: ListChecks, end: false },
];

/** The bottom tab bar used on phones, shown as a sidebar on wide screens. */
export function Navbar() {
  return (
    <nav
      aria-label="Main navigation"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border-subtle bg-surface-raised/95 backdrop-blur-md md:static md:border-b md:border-t-0 md:bg-surface-raised/80"
    >
      <ul className="mx-auto flex max-w-5xl items-stretch justify-around md:justify-start md:gap-1 md:px-6 md:py-3">
        {links.map((link) => (
          <li key={link.to} className="flex-1 md:flex-none">
            <NavLink
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-2 text-xs font-medium transition-colors md:min-h-0 md:flex-row md:gap-2 md:px-4 md:py-2 md:text-sm ${
                  isActive
                    ? 'bg-accent/10 text-accent md:bg-transparent'
                    : 'text-ink-faint hover:text-ink'
                }`
              }
            >
              <link.icon className="h-5 w-5" aria-hidden="true" />
              <span>{link.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
