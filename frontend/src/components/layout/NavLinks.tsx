import { NavLink } from 'react-router-dom';
import { navItemsForRole } from '../../app/navigation';
import { useAuth } from '../../features/auth/useAuth';

const baseLinkClasses = [
  'flex items-center gap-3 rounded-lg px-3 py-2.5',
  'text-sm font-medium transition-colors'
].join(' ');

const activeLinkClasses = 'bg-primary-50 text-primary-700';
const inactiveLinkClasses = 'text-slate-600 hover:bg-slate-100 hover:text-slate-900';

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <nav aria-label="Primary" className="flex flex-col gap-1">
      {navItemsForRole(user.role).map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              `${baseLinkClasses} ${isActive ? activeLinkClasses : inactiveLinkClasses}`
            }
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
