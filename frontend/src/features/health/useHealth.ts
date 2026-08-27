import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { getHealth } from './api';

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health(),
    queryFn: ({ signal }) => getHealth(signal),
    // /health is cheap and operationally useful to keep fresh without being manually refreshed.
    refetchInterval: 30_000,
    retry: false
  });
}
