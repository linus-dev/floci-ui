import { apiClient, apiEndpointKeys } from "@/api/api";
import type { ResourceSummary } from "@/api/types";

export interface SecretTag {
  key: string;
  value: string;
}

export interface SecretSummary {
  name: string;
  arn?: string;
  description?: string;
  rotationEnabled: boolean;
  kmsKeyId?: string;
  lastChangedDate?: string;
  lastAccessedDate?: string;
  createdDate?: string;
  tags: SecretTag[];
}

export interface SecretDetail extends SecretSummary {
  deletedDate?: string;
  versionIds: string[];
}

export interface SecretValue {
  name: string;
  arn?: string;
  versionId?: string;
  secretString?: string;
  secretBinary?: string;
  createdDate?: string;
}

export async function listSecrets(
  signal?: AbortSignal,
): Promise<SecretSummary[]> {
  const res = await apiClient.call<SecretSummary[]>(
    apiEndpointKeys.aws.secretsmanager.secrets.list,
    { signal },
  );

  return res.data;
}

export async function describeSecret(
  id: string,
  signal?: AbortSignal,
): Promise<SecretDetail> {
  const res = await apiClient.call<SecretDetail>(
    apiEndpointKeys.aws.secretsmanager.secrets.describe,
    { signal, params: { id } },
  );

  return res.data;
}

export async function getSecretValue(
  id: string,
  signal?: AbortSignal,
): Promise<SecretValue> {
  const res = await apiClient.call<SecretValue>(
    apiEndpointKeys.aws.secretsmanager.secrets.value.get,
    { signal, params: { id } },
  );

  return res.data;
}

export async function createSecret(
  name: string,
  secretString: string,
  description?: string,
  signal?: AbortSignal,
): Promise<{ name: string; arn?: string; versionId?: string }> {
  const res = await apiClient.call<
    { name: string; arn?: string; versionId?: string },
    { name: string; secretString: string; description?: string }
  >(
    apiEndpointKeys.aws.secretsmanager.secrets.create,
    { signal, body: { name, secretString, description } },
  );

  return res.data;
}

export async function putSecretValue(
  id: string,
  secretString: string,
  signal?: AbortSignal,
): Promise<{ arn?: string; versionId?: string }> {
  const res = await apiClient.call<
    { arn?: string; versionId?: string },
    { id: string; secretString: string }
  >(
    apiEndpointKeys.aws.secretsmanager.secrets.value.put,
    { signal, body: { id, secretString } },
  );

  return res.data;
}

export async function deleteSecret(
  id: string,
  force = false,
  signal?: AbortSignal,
): Promise<void> {
  await apiClient.call<void>(
    apiEndpointKeys.aws.secretsmanager.secrets.delete,
    { signal, params: { id, force: force ? "true" : undefined } },
  );
}

export async function listSecretResources(
  signal?: AbortSignal,
): Promise<ResourceSummary[]> {
  const secrets = await listSecrets(signal);

  return secrets.map((s) => ({
    id: s.arn ?? s.name,
    name: s.name,
    status: s.rotationEnabled ? "rotation enabled" : "available",
    description: s.description,
    metadata: {
      lastChangedDate: s.lastChangedDate,
      lastAccessedDate: s.lastAccessedDate,
      createdDate: s.createdDate,
      tagCount: s.tags.length,
    },
  }));
}

export const secretsManagerClient = {
  listSecrets,
  describeSecret,
  getSecretValue,
  createSecret,
  putSecretValue,
  deleteSecret,
  listResources: listSecretResources,
};
