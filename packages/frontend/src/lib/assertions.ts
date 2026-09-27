export function assert(
  condition: unknown,
  message = "Assertion failed",
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function assertDefined<T>(
  value: T,
  message = "Expected value to be defined",
): asserts value is NonNullable<T> {
  if (value == null) {
    throw new Error(message);
  }
}

export function assertNever(value: never, message?: string): never {
  throw new Error(message ?? `Unexpected value: ${String(value)}`);
}
