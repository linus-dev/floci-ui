import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { secretsManagerClient } from "./secretsmanager.api";
import { secretsManagerQueryKeys } from "./secretsmanager.queries";

export type CreateSecretMutationInput = {
  name: string;
  secretString: string;
  description?: string;
};

export type PutSecretValueMutationInput = {
  id: string;
  secretString: string;
};

export type DeleteSecretMutationInput = {
  id: string;
  force?: boolean;
};

export function useCreateSecretMutation(
  options?: UseMutationOptions<
    { name: string; arn?: string; versionId?: string },
    Error,
    CreateSecretMutationInput
  >,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ name, secretString, description }) =>
      secretsManagerClient.createSecret(name, secretString, description),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({
        queryKey: secretsManagerQueryKeys.list,
      });
      options?.onSuccess?.(...args);
    },
  });
}

export function usePutSecretValueMutation(
  options?: UseMutationOptions<
    { arn?: string; versionId?: string },
    Error,
    PutSecretValueMutationInput
  >,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, secretString }) =>
      secretsManagerClient.putSecretValue(id, secretString),
    ...options,
    onSuccess: (...args) => {
      const [, { id }] = args;
      void queryClient.invalidateQueries({
        queryKey: secretsManagerQueryKeys.value(id),
      });
      void queryClient.invalidateQueries({
        queryKey: secretsManagerQueryKeys.detail(id),
      });
      options?.onSuccess?.(...args);
    },
  });
}

export function useDeleteSecretMutation(
  options?: UseMutationOptions<void, Error, DeleteSecretMutationInput>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, force }) =>
      secretsManagerClient.deleteSecret(id, force ?? false),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({
        queryKey: secretsManagerQueryKeys.list,
      });
      options?.onSuccess?.(...args);
    },
  });
}
