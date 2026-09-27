export type EventListener<TEvent> = (event: TEvent) => void;
export type Unsubscribe = () => void;

export interface EventBusListenerError<TEvent> {
  error: unknown;
  event: TEvent;
  listener: EventListener<TEvent>;
}

export interface EventBusOptions<TEvent> {
  onListenerError?: (error: EventBusListenerError<TEvent>) => void;
}

export class EventBus<TEvent> {
  private readonly listeners = new Set<EventListener<TEvent>>();

  constructor(private readonly options: EventBusOptions<TEvent> = {}) {}

  subscribe(listener: EventListener<TEvent>): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(event: TEvent) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        this.options.onListenerError?.({
          error,
          event,
          listener,
        });
      }
    }
  }

  clear() {
    this.listeners.clear();
  }

  get size() {
    return this.listeners.size;
  }
}
