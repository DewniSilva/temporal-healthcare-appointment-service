import { HeartPulse } from 'lucide-react';
import { NavLinks } from './NavLinks';

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
      <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white">
          <HeartPulse className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="text-sm font-semibold text-slate-900">
          Healthcare Appointments
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <NavLinks />
      </div>
    </aside>
  );
}
