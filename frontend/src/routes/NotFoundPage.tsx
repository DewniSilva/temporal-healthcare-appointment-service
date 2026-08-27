import { Link } from 'react-router-dom';
import { SearchX } from 'lucide-react';

const linkClasses = [
  'mt-6 inline-flex items-center justify-center rounded-lg',
  'bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white',
  'hover:bg-primary-700',
  'focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-primary-500 focus-visible:ring-offset-2'
].join(' ');

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <SearchX className="h-10 w-10 text-slate-400" aria-hidden="true" />
      <h1 className="mt-4 text-lg font-semibold text-slate-900">
        Page not found
      </h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        The page you are looking for does not exist or may have moved.
      </p>
      <Link to="/dashboard" className={linkClasses}>
        Back to dashboard
      </Link>
    </div>
  );
}
