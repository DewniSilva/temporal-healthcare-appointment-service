import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';

const linkClasses = [
  'mt-6 inline-flex items-center justify-center rounded-lg',
  'bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white',
  'hover:bg-primary-700',
  'focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-primary-500 focus-visible:ring-offset-2'
].join(' ');

export function UnauthorizedPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <ShieldAlert className="h-10 w-10 text-slate-400" aria-hidden="true" />
      <h1 className="mt-4 text-lg font-semibold text-slate-900">
        You do not have access to this page
      </h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        Your account role does not permit this action. If you believe this is
        a mistake, contact an administrator.
      </p>
      <Link to="/dashboard" className={linkClasses}>
        Back to dashboard
      </Link>
    </div>
  );
}
