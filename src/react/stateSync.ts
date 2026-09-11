import { serializeJson } from "../client/serialization.js";
/** Compare JSON state without treating object insertion order as an edit. */
export function stateFingerprint(value: unknown): string {
  return serializeJson(value);
}

/** Trailing debounce with serialized writes, so a slower request cannot overwrite a newer edit. */
export class StateSynchronizer {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: Record<string, unknown> | undefined;
  private running: Promise<void> | undefined;
  private lastSaved: string;
  private lastReported: string;
  version: number;

  constructor(private options: {
    delay: number;
    initialState?: Record<string, unknown>;
    initialVersion?: number;
    save: (state: Record<string, unknown>, version: number) => Promise<{ version: number }>;
    onError: (error: unknown) => void;
    onSettled?: () => void;
  }) {
    this.version = options.initialVersion ?? 0;
    this.lastSaved = stateFingerprint(options.initialState ?? {});
    this.lastReported = this.lastSaved;
  }
  get busy() { return this.pending !== undefined || this.running !== undefined; }
  get fingerprint() { return this.lastReported; }
  accept(state: Record<string, unknown>, version: number) {
    if (this.busy) return;
    this.version = version;
    this.lastSaved = this.lastReported = stateFingerprint(state);
  }
  report(state: Record<string, unknown>) {
    const fingerprint = stateFingerprint(state);
    if (fingerprint === this.lastReported) return;
    this.lastReported = fingerprint;
    // Detach from the renderer's mutable state object.
    this.pending = JSON.parse(fingerprint) as Record<string, unknown>;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, Math.max(0, this.options.delay));
  }
  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.running) {
      await this.running;
      if (this.pending) await this.flush();
      return;
    }
    if (!this.pending) return;
    const value = this.pending;
    this.pending = undefined;
    const fingerprint = stateFingerprint(value);
    if (fingerprint === this.lastSaved) return;
    this.running = Promise.resolve().then(() => this.options.save(value, this.version)).then(result => {
      this.version = Math.max(this.version, result.version);
      this.lastSaved = fingerprint;
    }).catch((error: unknown) => {
      // A later report of the same value can retry a failed write.
      if (!this.pending) this.lastReported = this.lastSaved;
      this.options.onError(error);
    });
    await this.running;
    this.running = undefined;
    this.options.onSettled?.();
    if (this.pending && !this.timer) await this.flush();
  }
}
