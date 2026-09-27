import { EventBus } from "./EventBus";
import { assertApiRequestEvent } from "./assertions";
import type { ApiRequestEvent } from "./types";

export const apiRequestEventBus = new EventBus<ApiRequestEvent>({
  onListenerError: ({ error, event }) => {
    console.warn("[Telemetry] API request listener failed", {
      error,
      event,
    });
  },
});

export function subscribeApiRequests(
  listener: (event: ApiRequestEvent) => void,
) {
  return apiRequestEventBus.subscribe(listener);
}

export function emitApiRequest(event: ApiRequestEvent) {
  assertApiRequestEvent(event);
  apiRequestEventBus.publish(event);
}
