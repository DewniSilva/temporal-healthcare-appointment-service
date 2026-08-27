import { useLocation } from 'react-router-dom';
import { LogOut, Menu, User } from 'lucide-react';
import { useAuth } from '../../features/auth/useAuth';
import { pageTitleForPath } from '../../app/navigation';
import { Badge, type BadgeColor } from '../ui/Badge';
import type { UserRole } from '../../types/api';

const roleBadgeColor: Record<UserRole, BadgeColor> = {
  PATIENT: 'blue',
  DOCTOR: 'purple',
  ADMIN: 'amber'
};

const roleLabel: Record<UserRole, string> = {
  PATIENT: 'Patient',
  DOCTOR: 'Doctor',
  ADMIN: 'Admin'
};

export function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { user, signOut } = useAuth();
  const { pathname } = useLocation();
  const title = pageTitleForPath(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
      <button
        type="button"
        onClick={onOpenMenu}
        className="rounded p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      <h1 className="flex-1 truncate text-base font-semibold text-slate-900">
        {title}
      </h1>

      {user && (
        <div className="flex items-center gap-3">
          <Badge color={roleBadgeColor[user.role]}>{roleLabel[user.role]}</Badge>

          <details className="group relative">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg p-1.5 hover:bg-slate-100">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-slate-600">
                <User className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="sr-only">Open user menu</span>
            </summary>
            <div className="absolute right-0 z-40 mt-2 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-card">
              <p className="truncate px-2 py-1.5 text-xs text-slate-500">
                Signed in as
                <span className="mt-0.5 block truncate font-medium text-slate-700">
                  {user.userId}
                </span>
              </p>
              <button
                type="button"
                onClick={signOut}
                className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Log out
              </button>
            </div>
          </details>
        </div>
      )}
    </header>
  );
}
