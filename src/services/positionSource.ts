import type { RawFix } from '../core/types';

/** Abstraction over "a stream of GPS fixes", so driveController can run headless in tests. */
export interface PositionSource {
  start(cb: (fix: RawFix) => void, onError: (msg: string) => void): void;
  stop(): void;
}
