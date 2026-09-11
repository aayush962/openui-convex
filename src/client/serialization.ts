/** OpenUI uses $binding keys, which cannot cross Convex's object-value boundary. */
export type EncodedState = { openuiEncoding: "json-v1"; data: string };
export function encodeState(state: Record<string, unknown>): EncodedState {
  return encodeValue(state);
}

export function encodeValue(value: unknown): EncodedState {
  return { openuiEncoding: "json-v1", data: serializeJson(value) };
}
export function decodeValue(value: unknown): unknown {
  if (value && typeof value === "object" && "openuiEncoding" in value && value.openuiEncoding === "json-v1" && "data" in value && typeof value.data === "string") {
    return JSON.parse(value.data) as unknown;
  }
  return value;
}

export function decodeState(value: Record<string, unknown>): Record<string, unknown> {
  if (value.openuiEncoding !== "json-v1" || typeof value.data !== "string") return value;
  const parsed = decodeValue(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid OpenUI state: expected an object");
  return parsed as Record<string, unknown>;
}

/** Fail explicitly instead of silently dropping undefined, NaN, dates, or cyclic values. */
export function serializeJson(value: unknown): string {
  const ancestors = new WeakSet<object>();
  function normalize(entry: unknown): unknown {
    if (entry === undefined || typeof entry === "function" || typeof entry === "symbol" || typeof entry === "bigint") {
      throw new Error("OpenUI state must contain JSON values");
    }
    if (typeof entry === "number" && !Number.isFinite(entry)) throw new Error("OpenUI state must contain finite numbers");
    if (entry && typeof entry === "object") {
      if (ancestors.has(entry)) throw new Error("OpenUI state must not contain cycles");
      if (!Array.isArray(entry) && Object.getPrototypeOf(entry) !== Object.prototype && Object.getPrototypeOf(entry) !== null) {
        throw new Error("OpenUI state must contain plain JSON objects");
      }
      ancestors.add(entry);
      const normalized = Array.isArray(entry) ? entry.map(normalize) : Object.fromEntries(
        Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalize(item)]),
      );
      ancestors.delete(entry);
      return normalized;
    }
    return entry;
  }
  return JSON.stringify(normalize(value));
}
