const REDACTED = "[redacted]";
const INSPECT = Symbol.for("nodejs.util.inspect.custom");

/**
 * Holds a secret so it cannot leak through logging, JSON output, string
 * conversion or console inspection. The only way out is reveal().
 */
export class Secret {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  reveal(): string {
    return this.#value;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  [INSPECT](): string {
    return REDACTED;
  }
}
