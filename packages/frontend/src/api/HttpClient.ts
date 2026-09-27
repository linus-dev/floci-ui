import { emitApiRequest, type CloudProvider } from "@/telemetry";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface HttpClientConfig {
  baseUrl?: string;
  defaultHeaders?: Record<string, string>;
  cache?: RequestCache;
  timeout?: number;
}

export interface RequestTelemetry {
  provider?: CloudProvider;
  service?: string;
}

export type EndpointRegistry = Map<string, EndpointDefinition>;

export interface RequestOptions<TBody = unknown>
  extends Omit<RequestInit, "body" | "method"> {
  params?: Record<string, string | number | boolean | undefined>;
  body?: TBody;
  rawBody?: BodyInit;
  cache?: RequestCache;
  timeout?: number;
  baseUrlOverride?: string;
  telemetry?: RequestTelemetry;
}

export interface HttpResponse<TData> {
  data: TData;
  status: number;
  headers: Headers;
  ok: boolean;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: unknown,
    public readonly url: string,
  ) {
    super(httpErrorMessage(status, statusText, body, url));
    this.name = "HttpError";
  }
}

export class NetworkError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "NetworkError";
  }
}

function httpErrorMessage(
  status: number,
  statusText: string,
  body: unknown,
  url: string,
): string {
  const apiMessage = apiErrorMessage(body);
  if (!apiMessage) return `HTTP ${status} - ${statusText} [${url}]`;

  const code = apiErrorCode(body);
  const suffix = code ? ` (${code})` : "";
  return `${apiMessage}${suffix} [${url}]`;
}

function apiErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const value = (body as { message?: unknown; error?: unknown }).message ?? (body as { error?: unknown }).error;
  if (typeof value !== "string" || !value.trim()) return null;

  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim() && detail.trim() !== value.trim()) {
    return `${value.trim()}: ${detail.trim()}`;
  }
  return value.trim();
}

function apiErrorCode(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const value = (body as { code?: unknown }).code;
  return typeof value === "string" && value.trim() ? value : null;
}

export class TimeoutError extends Error {
  constructor(
    public readonly url: string,
    public readonly timeoutMs: number,
  ) {
    super(`Request timed out after ${timeoutMs}ms [${url}]`);
    this.name = "TimeoutError";
  }
}

export class ResponseParseError extends Error {
  constructor(
    public readonly url: string,
    public readonly cause?: unknown,
  ) {
    super(`Failed to parse response [${url}]`);
    this.name = "ResponseParseError";
  }
}

export type RequestInterceptor = (
  url: string,
  init: RequestInit,
) =>
  | Promise<{ url: string; init: RequestInit }>
  | { url: string; init: RequestInit };

export type ResponseInterceptor = (
  response: Response,
) => Promise<Response> | Response;

export type EndpointDefaults = Omit<RequestOptions<never>, "body" | "params">;

export type EndpointDefinition = {
  path: string;
  method: HttpMethod;
  defaults?: Partial<EndpointDefaults>;
  baseUrlOverride?: string;
  telemetry?: RequestTelemetry;
};

export class HttpClient {
  private readonly config: HttpClientConfig;
  private readonly requestInterceptors: RequestInterceptor[] = [];
  private readonly responseInterceptors: ResponseInterceptor[] = [];
  private readonly endpointRegistry: EndpointRegistry;

  constructor(
    config: HttpClientConfig = {},
    registry: EndpointRegistry = new Map(),
  ) {
    this.config = config;
    this.endpointRegistry = registry;
  }

  addRequestInterceptor(interceptor: RequestInterceptor): this {
    this.requestInterceptors.push(interceptor);
    return this;
  }

  addResponseInterceptor(interceptor: ResponseInterceptor): this {
    this.responseInterceptors.push(interceptor);
    return this;
  }

  async request<TResponse, TBody = unknown>(
    method: HttpMethod,
    endpoint: string,
    options: RequestOptions<TBody> = {},
  ): Promise<HttpResponse<TResponse>> {
    const started = performance.now();
    const {
      params,
      body,
      rawBody,
      timeout,
      cache,
      baseUrlOverride,
      telemetry,
      ...restOptions
    } = options;
    let finalUrl = endpoint;
    let statusCode = 0;

    try {
      const base = baseUrlOverride ?? this.config.baseUrl ?? "";
      const rawUrl = endpoint.startsWith("http")
        ? endpoint
        : `${base}${endpoint}`;
      finalUrl = this.buildUrl(rawUrl, params);

      const headers: Record<string, string> = {
        Accept: "application/json",
        ...this.config.defaultHeaders,
        ...(body !== undefined && rawBody === undefined
          ? { "Content-Type": "application/json" }
          : {}),
        ...(restOptions.headers as Record<string, string> | undefined),
      };

      let init: RequestInit = {
        ...restOptions,
        method,
        headers,
        cache: cache ?? this.config.cache,
        ...(rawBody !== undefined
          ? { body: rawBody }
          : body !== undefined
            ? { body: JSON.stringify(body) }
            : {}),
      };

      for (const interceptor of this.requestInterceptors) {
        ({ url: finalUrl, init } = await interceptor(finalUrl, init));
      }

      let response = await this.fetchWithTimeout(
        finalUrl,
        init,
        timeout ?? this.config.timeout,
      );
      statusCode = response.status;

      for (const interceptor of this.responseInterceptors) {
        response = await interceptor(response);
      }

      if (!response.ok) {
        throw await this.createHttpError(response, finalUrl);
      }

      return {
        data: await this.parseResponse<TResponse>(response, finalUrl),
        status: response.status,
        headers: response.headers,
        ok: response.ok,
      };
    } catch (error) {
      throw this.normalizeError(error, finalUrl, timeout ?? this.config.timeout);
    } finally {
      if (telemetry?.service && statusCode > 0) {
        emitApiRequest({
          provider: telemetry.provider ?? "aws",
          service: telemetry.service,
          method,
          path: endpoint,
          statusCode,
          latencyMs: Math.round(performance.now() - started),
          timestamp: Date.now(),
        });
      }
    }
  }

  async call<TResponse, TBody = unknown>(
    key: string,
    options: RequestOptions<TBody> = {},
    pathParams?: Record<string, string>,
  ): Promise<HttpResponse<TResponse>> {
    const endpoint = this.endpointRegistry.get(key);
    if (!endpoint) throw new Error(`Endpoint "${key}" is not registered.`);

    let path = endpoint.path;
    if (pathParams) {
      for (const [param, value] of Object.entries(pathParams)) {
        path = path.replace(`:${param}`, encodeURIComponent(value));
      }
    }

    return this.request<TResponse, TBody>(endpoint.method, path, {
      ...endpoint.defaults,
      ...options,
      baseUrlOverride: endpoint.baseUrlOverride,
      telemetry: {
        ...endpoint.telemetry,
        ...options.telemetry,
      },
    });
  }

  get<TResponse>(endpoint: string, options?: RequestOptions<never>) {
    return this.request<TResponse, never>("GET", endpoint, options);
  }

  post<TResponse, TBody = unknown>(
    endpoint: string,
    body?: TBody,
    options?: RequestOptions<TBody>,
  ) {
    return this.request<TResponse, TBody>("POST", endpoint, {
      ...options,
      body,
    });
  }

  put<TResponse, TBody = unknown>(
    endpoint: string,
    body?: TBody,
    options?: RequestOptions<TBody>,
  ) {
    return this.request<TResponse, TBody>("PUT", endpoint, {
      ...options,
      body,
    });
  }

  patch<TResponse, TBody = unknown>(
    endpoint: string,
    body?: TBody,
    options?: RequestOptions<TBody>,
  ) {
    return this.request<TResponse, TBody>("PATCH", endpoint, {
      ...options,
      body,
    });
  }

  delete<TResponse>(endpoint: string, options?: RequestOptions<never>) {
    return this.request<TResponse, never>("DELETE", endpoint, options);
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs?: number,
  ): Promise<Response> {
    if (!timeoutMs) return fetch(url, init);

    const timeoutController = new AbortController();
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      timeoutController.abort();
    }, timeoutMs);
    const signal = this.mergeSignals(init.signal, timeoutController.signal);

    try {
      return await fetch(url, {
        ...init,
        signal,
      });
    } catch (error) {
      if (timedOut) throw new TimeoutError(url, timeoutMs);
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  private mergeSignals(
    requestSignal: AbortSignal | null | undefined,
    timeoutSignal: AbortSignal,
  ): AbortSignal {
    if (!requestSignal) return timeoutSignal;
    if (requestSignal.aborted) return requestSignal;
    if (timeoutSignal.aborted) return timeoutSignal;

    const controller = new AbortController();
    const abort = () => controller.abort();

    requestSignal.addEventListener("abort", abort, { once: true });
    timeoutSignal.addEventListener("abort", abort, { once: true });

    return controller.signal;
  }

  private async createHttpError(
    response: Response,
    url: string,
  ): Promise<HttpError> {
    const text = await response.text();
    let body: unknown;

    if (text.trim()) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    } else {
      body = undefined;
    }

    return new HttpError(response.status, response.statusText, body, url);
  }

  private async parseResponse<TResponse>(
    response: Response,
    url: string,
  ): Promise<TResponse> {
    if (response.status === 204) return undefined as TResponse;

    const contentLength = response.headers.get("content-length");
    if (contentLength === "0") return undefined as TResponse;

    const text = await response.text();
    if (!text.trim()) return undefined as TResponse;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return text as TResponse;
    }

    try {
      return JSON.parse(text) as TResponse;
    } catch (error) {
      throw new ResponseParseError(url, error);
    }
  }

  private normalizeError(
    error: unknown,
    url: string,
    timeoutMs?: number,
  ): Error {
    if (
      error instanceof HttpError ||
      error instanceof NetworkError ||
      error instanceof TimeoutError ||
      error instanceof ResponseParseError
    ) {
      return error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      if (timeoutMs) return new TimeoutError(url, timeoutMs);
      return new NetworkError("Request aborted", url, error);
    }

    return new NetworkError(
      error instanceof Error ? error.message : "Network error",
      url,
      error,
    );
  }

  private buildUrl(
    base: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): string {
    if (!params) return base;

    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) query.append(key, String(value));
    }

    const qs = query.toString();
    return qs ? `${base}?${qs}` : base;
  }
}
