import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { pageTitleForPath } from '../../app/navigation';

function segmentLabel(pathname: string): string {
  const title = pageTitleForPath(pathname);
  if (title !== 'Healthcare Appointments') return title;
  const last = pathname.split('/').filter(Boolean).pop();
  return last ?? 'Page';
}

export function Breadcrumbs() {
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  const crumbs = segments.map((_, index) => {
    const path = `/${segments.slice(0, index + 1).join('/')}`;
    return { path, label: segmentLabel(path) };
  });

  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-sm text-slate-500">
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link to="/dashboard" className="hover:text-primary-700">
            Home
          </Link>
        </li>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <li key={crumb.path} className="flex items-center gap-1.5">
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              {isLast ? (
                <span aria-current="page" className="font-medium text-slate-700">
                  {crumb.label}
                </span>
              ) : (
                <Link to={crumb.path} className="hover:text-primary-700">
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
