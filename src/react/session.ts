import type { StateDoc, UIState } from "../client/index.js";
import { decodeState } from "../client/serialization.js";
import { StateSynchronizer, stateFingerprint } from "./stateSync.js";

export type SessionView = { ready: boolean; state: UIState | undefined; revision: number };
export const LOADING_VIEW: SessionView = { ready: false, state: undefined, revision: 0 };

/**
 * One interface's persisted state: hydration, local edits, and the rules for accepting remote snapshots.
 * Framework-agnostic; `useOpenUIState` exposes `view` through `useSyncExternalStore`.
 */
export class InterfaceSession {
  view: SessionView = LOADING_VIEW;
  readonly sync: StateSynchronizer;
  private row: StateDoc | null | undefined;
  private hadRemote = false;
  private instanceId: string | undefined;
  private disposed = false;

  constructor(readonly identity: string, private options: {
    delay: number;
    save: (state: UIState, version: number) => Promise<{ version: number }>;
    onError: (error: unknown) => void;
    /** Whether the user is interacting with the interface right now. */
    isFocused: () => boolean;
    /** Called after `view` changes. */
    onChange: () => void;
  }) {
    this.sync = new StateSynchronizer({
      delay: options.delay, save: options.save, onError: options.onError,
      onSettled: () => this.recheck(),
    });
  }

  /** Feed the latest persisted row, or `null` when none exists. */
  receive(row: StateDoc | null) {
    this.row = row;
    this.recheck();
  }

  /** Re-evaluate the last row, for example after a write settles or focus leaves the interface. */
  recheck() {
    const row = this.row;
    if (this.disposed || row === undefined) return;
    if (!this.view.ready) { this.apply(row); return; }
    // Never replace what the user is editing or what is still being written.
    if (this.sync.busy || this.options.isFocused()) return;
    const recreated = row !== null && row.instanceId !== this.instanceId;
    if (row && row.version < this.sync.version && !recreated) return;
    if (!row && !this.hadRemote) return;
    this.apply(row);
  }

  report(state: UIState) { this.sync.report(state); }
  flush() { return this.sync.flush(); }
  /** Stop reacting to rows and write pending edits. */
  dispose() {
    this.disposed = true;
    return this.sync.flush();
  }

  private apply(row: StateDoc | null) {
    const state = row ? decodeState(row.state) : {};
    const different = stateFingerprint(state) !== this.sync.fingerprint;
    this.sync.accept(state, row?.version ?? 0);
    this.hadRemote = row !== null;
    this.instanceId = row?.instanceId;
    if (different || !this.view.ready) {
      // No row means the Renderer should start from its own defaults.
      this.view = { ready: true, state: row ? state : undefined, revision: this.view.revision + 1 };
      this.options.onChange();
    }
  }
}
