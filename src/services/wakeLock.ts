// Screen wake lock wrapper. Keeps the display on while driving (mounted,
// screen-on use case). navigator.wakeLock (iOS 16.4+) releases the lock on
// any visibilitychange (e.g. app backgrounded then foregrounded, or even
// some in-app overlays) — so we must re-acquire whenever the page becomes
// visible again, for as long as the caller still wants it held.

import { signal, type Signal } from '@preact/signals';

export interface WakeLockHandle {
  /** Request the lock. Safe to call repeatedly; no-op if already held. */
  acquire(): Promise<void>;
  /** Release the lock and stop re-acquiring on visibilitychange. */
  release(): Promise<void>;
  /** True once a re-acquire attempt has failed, or the API is unavailable. */
  lost: Signal<boolean>;
}

type NavigatorWakeLock = Navigator & {
  wakeLock?: {
    request(type: 'screen'): Promise<WakeLockSentinelLike>;
  };
};

interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

export function createWakeLock(): WakeLockHandle {
  const lost = signal(false);

  let sentinel: WakeLockSentinelLike | null = null;
  let wanted = false;

  const nav = navigator as NavigatorWakeLock;
  const supported = typeof nav.wakeLock?.request === 'function';

  async function doAcquire(): Promise<void> {
    if (!supported) {
      lost.value = true;
      return;
    }
    try {
      sentinel = (await nav.wakeLock!.request('screen')) as WakeLockSentinelLike;
      lost.value = false;
      sentinel.addEventListener('release', () => {
        sentinel = null;
        // Only surface as "lost" if we still want the lock held (a
        // deliberate release() call also fires this event).
        if (wanted) lost.value = true;
      });
    } catch {
      sentinel = null;
      lost.value = true;
    }
  }

  async function acquire(): Promise<void> {
    wanted = true;
    if (sentinel && !sentinel.released) return;
    await doAcquire();
  }

  async function release(): Promise<void> {
    wanted = false;
    const s = sentinel;
    sentinel = null;
    if (s && !s.released) {
      await s.release();
    }
  }

  function onVisibilityChange(): void {
    if (wanted && document.visibilityState === 'visible' && !sentinel) {
      void doAcquire();
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  return { acquire, release, lost };
}
