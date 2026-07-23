// Fire-and-forget nudge for persistent storage, so Safari/Chrome are less
// likely to evict IndexedDB under storage pressure. Best-effort: browsers
// may grant/deny based on site engagement heuristics without any UI prompt.

/** Request persistent storage. Never throws; resolves once the attempt settles. */
export function requestPersistentStorage(): void {
  void navigator.storage?.persist?.().catch(() => {
    // Ignore — best-effort only.
  });
}

/** True if storage is already persisted, false for "best-effort" or unsupported. */
export async function isStoragePersisted(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    return false;
  }
}
