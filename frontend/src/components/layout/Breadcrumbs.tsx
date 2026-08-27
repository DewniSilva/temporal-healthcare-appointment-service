import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { pageTitleForPath } from '../../app/navigation';

// pageTitleForPath's fallback also doubles as "this path has no page of its own" (see isRoutablePath below).
const NO_PAGE_TITLE = 'Healthcare Appointments';

function segmentLabel(pathname: string): string {
  const title = pageTitleForPath(pathname);
  if (title !== NO_PAGE_TITLE) return title;
  const last = pathname.split('/').filter(Boolean).pop() ?? 'Page';
  return last.charAt(0).toUpperCase() + last.slice(1);
}

/** Intermediate path segments like /appointments (from /appointments/new) are not routes on their own. */
function isRoutablePath(pathname: string): boolean {
  return pageTitleForPath(pathname) !== NO_PAGE_TITLE;
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
          const linkable = !isLast && isRoutablePath(crumb.path);
          return (
            <li key={crumb.path} className="flex items-center gap-1.5">
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              {linkable ? (
                <Link to={crumb.path} className="hover:text-primary-700">
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current={isLast ? 'page' : undefined} className={isLast ? 'font-medium text-slate-700' : undefined}>
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
