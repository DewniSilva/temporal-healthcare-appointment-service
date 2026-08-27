const skeletonClasses = [
  'animate-pulse rounded-md bg-slate-200',
  'motion-reduce:animate-none'
].join(' ');

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`${skeletonClasses} ${className}`} aria-hidden="true" />;
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl2 border border-slate-200 bg-white p-5 shadow-card sm:p-6">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="mt-3 h-3 w-2/3" />
      <Skeleton className="mt-2 h-3 w-1/2" />
    </div>
  );
}
