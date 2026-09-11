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

/**
 * `JSON.stringify` semantics with sorted keys, so equal states have equal fingerprints regardless of key order.
 * The Renderer reports fields as `{ value, componentType }` with `componentType` often undefined, so `undefined`,
 * functions, and symbols are dropped from objects and become `null` in arrays; non-finite numbers become `null`;
 * objects with `toJSON`, such as dates, serialize through it. Cycles and BigInt throw, as they do in JSON.
 */
export function serializeJson(value: unknown): string {
  const ancestors = new WeakSet<object>();
  function normalize(entry: unknown): unknown {
    if (entry && typeof entry === "object" && typeof (entry as { toJSON?: unknown }).toJSON === "function") {
      entry = (entry as { toJSON: () => unknown }).toJSON();
    }
    if (entry === undefined || typeof entry === "function" || typeof entry === "symbol") return undefined;
    if (typeof entry === "bigint") throw new Error("OpenUI state must not contain BigInt values");
    if (typeof entry === "number" && !Number.isFinite(entry)) return null;
    if (entry && typeof entry === "object") {
      if (ancestors.has(entry)) throw new Error("OpenUI state must not contain cycles");
      ancestors.add(entry);
      const normalized = Array.isArray(entry)
        ? entry.map(item => normalize(item) ?? null)
        : Object.fromEntries(
          Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)).flatMap(([key, item]) => {
            const normalizedItem = normalize(item);
            return normalizedItem === undefined ? [] : [[key, normalizedItem]];
          }),
        );
      ancestors.delete(entry);
      return normalized;
    }
    return entry;
  }
  return JSON.stringify(normalize(value) ?? null);
}
