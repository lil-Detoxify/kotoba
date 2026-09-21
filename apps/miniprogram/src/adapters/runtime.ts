type Cloneable = null | boolean | number | string | undefined | Date | Cloneable[] | { [key: string]: Cloneable };
type CloneFunction = <T>(value: T) => T;

/** Install the small-program structuredClone fallback required by @jp/core. */
export function ensureStudyRuntime(): void {
  const runtime = globalThis as typeof globalThis & { structuredClone?: CloneFunction };
  if (typeof runtime.structuredClone === "function") return;
  runtime.structuredClone = <T>(value: T): T => cloneValue(value, new WeakMap<object, unknown>()) as T;
}

function cloneValue(value: unknown, seen: WeakMap<object, unknown>): Cloneable {
  if (value === null || typeof value !== "object") {
    if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
      throw new TypeError("Unsupported value in mini-program structuredClone fallback");
    }
    return value as Cloneable;
  }
  const prior = seen.get(value);
  if (prior) return prior as Cloneable;
  if (value instanceof Date) {
    const result = new Date(value.getTime());
    seen.set(value, result);
    return result;
  }
  if (Array.isArray(value)) {
    const result: Cloneable[] = [];
    seen.set(value, result);
    for (const item of value) result.push(cloneValue(item, seen));
    return result;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Unsupported object in mini-program structuredClone fallback");
  }
  const result: { [key: string]: Cloneable } = Object.create(prototype);
  seen.set(value, result);
  for (const key of Object.keys(value)) result[key] = cloneValue((value as Record<string, unknown>)[key], seen);
  return result;
}
