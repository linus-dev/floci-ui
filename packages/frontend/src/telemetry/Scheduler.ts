export type ScheduledJob = {
  name: string;
  intervalMs: number;
  run: () => void | Promise<void>;
};

export class Scheduler {
  private readonly timers = new Map<string, number>();

  add(job: ScheduledJob) {
    if (this.timers.has(job.name)) {
      throw new Error(`Scheduled job "${job.name}" already exists.`);
    }

    const timer = window.setInterval(() => {
      void job.run();
    }, job.intervalMs);

    this.timers.set(job.name, timer);
  }

  stop() {
    for (const timer of this.timers.values()) {
      window.clearInterval(timer);
    }

    this.timers.clear();
  }
}
