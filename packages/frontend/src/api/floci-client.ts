import { apiClient } from "./api";
import type { HttpMethod } from "./HttpClient";
import {
  subscribeApiRequests,
  type ApiRequestEvent,
} from "@/telemetry";

export type FlociRequestEvent = ApiRequestEvent;

export function subscribeRequests(
  cb: (event: FlociRequestEvent) => void,
): () => void {
  return subscribeApiRequests(cb);
}

export function apiGet<T>(
  path: string,
  service: string,
  signal?: AbortSignal,
): Promise<T> {
  return apiRequest<T>("GET", path, service, undefined, signal);
}

export function apiPost<T>(
  path: string,
  service: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  return apiRequest<T>("POST", path, service, body, signal);
}

export function apiPut<T>(
  path: string,
  service: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  return apiRequest<T>("PUT", path, service, body, signal);
}

export function apiDelete<T>(
  path: string,
  service: string,
  signal?: AbortSignal,
): Promise<T> {
  return apiRequest<T>("DELETE", path, service, undefined, signal);
}

async function apiRequest<T>(
  method: HttpMethod,
  path: string,
  service: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const res = await apiClient.request<T>(method, path, {
    signal,
    ...(body === undefined ? {} : { body }),
    telemetry: { provider: "aws", service },
  });
  return res.data;
}
