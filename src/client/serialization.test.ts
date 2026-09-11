import { describe, expect, test } from "vitest";
import { decodeState, encodeState, serializeJson } from "./serialization.js";

describe("state serialization", () => {
  test("accepts the shape the OpenUI Renderer reports and drops undefined properties", () => {
    // Text inputs report componentType as undefined; the strict serializer used to reject the whole snapshot.
    const snapshot = { contactForm: { name: { value: "Ada Lovelace", componentType: undefined }, email: { value: "ada@example.com", componentType: undefined } }, $agree: true };
    expect(decodeState(encodeState(snapshot))).toEqual({ contactForm: { name: { value: "Ada Lovelace" }, email: { value: "ada@example.com" } }, $agree: true });
  });
  test("follows JSON.stringify for arrays, non-finite numbers, dates, and functions", () => {
    const value = { list: [1, undefined, () => 1, NaN], when: new Date("2026-09-11T00:00:00.000Z"), run: () => 1, ratio: Infinity };
    expect(JSON.parse(serializeJson(value))).toEqual(JSON.parse(JSON.stringify(value)));
    expect(JSON.parse(serializeJson(value))).toEqual({ list: [1, null, null, null], when: "2026-09-11T00:00:00.000Z", ratio: null });
  });
  test("sorts keys at every depth so fingerprints ignore insertion order", () => {
    expect(serializeJson({ b: { d: 1, c: 2 }, a: [{ z: 1, y: 2 }] })).toBe(serializeJson({ a: [{ y: 2, z: 1 }], b: { c: 2, d: 1 } }));
    expect(serializeJson({ a: 1, b: undefined })).toBe(serializeJson({ a: 1 }));
  });
  test("rejects cycles and BigInt like JSON does", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => serializeJson(cyclic)).toThrow("cycles");
    expect(() => serializeJson({ big: 1n })).toThrow("BigInt");
  });
});
