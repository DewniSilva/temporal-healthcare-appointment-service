import { Activity, RotateCw } from 'lucide-react';
import { Card, CardHeader } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { useHealth } from './useHealth';

export function HealthCard() {
  const { data, isLoading, isError, refetch, isFetching } = useHealth();

  return (
    <Card>
      <CardHeader
        title="Service health"
        description="Live status from GET /health"
        action={
          <Button variant="secondary" size="sm" onClick={() => refetch()} isLoading={isFetching}>
            <RotateCw className="h-4 w-4" aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      {isLoading && <Spinner label="Checking service health" />}

      {!isLoading && (isError || !data) && (
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-red-500" aria-hidden="true" />
          <Badge color="red">Unavailable</Badge>
          <span className="text-sm text-slate-500">The API did not respond as healthy.</span>
        </div>
      )}

      {data && (
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">API</dt>
            <dd className="mt-1">
              <Badge color="green">{data.status}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Database</dt>
            <dd className="mt-1">
              <Badge color="green">{data.database}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Temporal client</dt>
            <dd className="mt-1">
              <Badge color="green">{data.temporalClient}</Badge>
            </dd>
          </div>
        </dl>
      )}
    </Card>
  );
}
