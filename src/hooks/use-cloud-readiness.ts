import { useQuery } from "@tanstack/react-query";

import { getCloudBackendReadiness } from "@/services/cloud-readiness.service";

export function useCloudBackendReadiness(enabled = true) {
  return useQuery({
    queryKey: ["cloud-backend-readiness"],
    queryFn: getCloudBackendReadiness,
    enabled,
    refetchInterval: enabled ? 30_000 : false,
    retry: 1,
  });
}
