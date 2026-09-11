import { afterEach, describe, expect, test, vi } from "vitest";
import { StateSynchronizer, stateFingerprint } from "./stateSync.js";
afterEach(() => vi.useRealTimers());

describe("state synchronizer", () => {
  test("coalesces an edit burst into one trailing write", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue({ version: 1 });
    const sync = new StateSynchronizer({ delay: 400, save, onError: vi.fn() });
    sync.report({ text: "a" });
    await vi.advanceTimersByTimeAsync(200);
    sync.report({ text: "ab" });
    await vi.advanceTimersByTimeAsync(399);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledExactlyOnceWith({ text: "ab" }, 0);
    expect(sync.version).toBe(1);
  });
  test("serializes slow writes and drains edits on unmount flush", async () => {
    let finish!: (value: { version: number }) => void;
    const save = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue({ version: 2 });
    const sync = new StateSynchronizer({ delay: 400, save, onError: vi.fn() });
    sync.report({ text: "a" });
    const first = sync.flush();
    await Promise.resolve();
    sync.report({ text: "b" });
    const second = sync.flush();
    expect(save).toHaveBeenCalledTimes(1);
    finish({ version: 1 });
    await Promise.all([first, second]);
    expect(save).toHaveBeenNthCalledWith(2, { text: "b" }, 1);
    expect(sync.busy).toBe(false);
  });
  test("reports synchronous errors and allows a same-value retry", async () => {
    const onError = vi.fn();
    const save = vi.fn().mockImplementationOnce(() => { throw new Error("offline"); }).mockResolvedValue({ version: 1 });
    const sync = new StateSynchronizer({ delay: 400, save, onError });
    sync.report({ value: 1 });
    await sync.flush();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(sync.busy).toBe(false);
    sync.report({ value: 1 });
    await sync.flush();
    expect(sync.version).toBe(1);
  });
  test("does not replace local edits with remote echoes while busy", async () => {
    const sync = new StateSynchronizer({ delay: 400, save: vi.fn().mockResolvedValue({ version: 2 }), onError: vi.fn() });
    sync.report({ text: "local" });
    sync.accept({ text: "remote" }, 1);
    expect(sync.fingerprint).toBe(stateFingerprint({ text: "local" }));
    await sync.flush();
  });
  test("ignores changes in object key order", async () => {
    const save = vi.fn();
    const sync = new StateSynchronizer({ delay: 400, initialState: { a: 1, b: { c: 2, d: 3 } }, save, onError: vi.fn() });
    sync.report({ b: { d: 3, c: 2 }, a: 1 });
    await sync.flush();
    expect(save).not.toHaveBeenCalled();
  });
});
