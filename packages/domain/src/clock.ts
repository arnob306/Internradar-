/**
 * Every piece of domain code that needs "now" takes a Clock. The domain never
 * reads the system clock itself; the real clock lives in the app entrypoints.
 */
export interface Clock {
  now(): Date;
}

/** A clock frozen at one instant, for tests and reproducible evaluations. */
export class FixedClock implements Clock {
  private readonly epochMs: number;

  constructor(instant: Date) {
    this.epochMs = instant.getTime();
  }

  now(): Date {
    return new Date(this.epochMs);
  }
}
