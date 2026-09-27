export interface TelemetryIngestor {
  name: string;
  flushIntervalMs: number;
  start(): void;
  stop(): void;
  flush(): void | Promise<void>;
}
