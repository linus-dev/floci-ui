import { useQuery } from "@tanstack/react-query";
import { secretsManagerClient } from "./secretsmanager.api";

export const secretsManagerQueryKeys = {
  list: ["secretsmanager", "secrets"] as const,
  detail: (id: string | null) => ["secretsmanager", "detail", id] as const,
  value: (id: string | null) => ["secretsmanager", "value", id] as const,
};

export function useSecretsQuery(enabled = true) {
  return useQuery({
    queryKey: secretsManagerQueryKeys.list,
    queryFn: ({ signal }) => secretsManagerClient.listSecrets(signal),
    enabled,
  });
}

export function useSecretDetailQuery(id: string | null) {
  return useQuery({
    queryKey: secretsManagerQueryKeys.detail(id),
    queryFn: ({ signal }) => secretsManagerClient.describeSecret(id!, signal),
    enabled: Boolean(id),
  });
}

export function useSecretValueQuery(id: string | null, enabled = false) {
  return useQuery({
    queryKey: secretsManagerQueryKeys.value(id),
    queryFn: ({ signal }) => secretsManagerClient.getSecretValue(id!, signal),
    enabled: Boolean(id) && enabled,
    // Keep the plaintext out of the long-lived cache: always refetch on reveal
    // and drop it the moment the query loses its observer so a hidden value
    // cannot be read back later.
    gcTime: 0,
    staleTime: 0,
  });
}
