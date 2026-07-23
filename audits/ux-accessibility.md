# UX — UX & Accessibility

DriveScreen is meant to be read in a single glance while the car is moving,
but several safety-relevant signals (ETA basis, wake-lock warning, off-route
status) render as small, low-contrast secondary text, and the app leans on
native `alert()`/`confirm()`/`prompt()` dialogs that fully block the screen —
including right as a drive ends. Second risk: nothing stops a stray back
navigation from silently abandoning an in-progress recording. Ledger prefix: **UX**.

## Drive-screen glanceability

- [ ] `.drive-eta-basis` (`font-size: 0.75em; opacity: 0.7` in styles.css): verify the ETA line is legible at arm's length in a car, not just up close.
- [ ] `.wake-lock-warning` (amber `#f59e0b`, `0.75rem`): verify the "screen may sleep" line is noticeable enough to prompt action — plain small text, no icon, no repeat cue.
- [ ] `simConfig.debug` panel in `DriveScreen.tsx`: verify it can't render during a real drive without the explicit `?debug=1` opt-in — dense telemetry text is a distraction hazard.

## Touch / gesture

- [ ] `.hold-to-stop-btn` / `HOLD_TO_STOP_MS = 800`: verify the hold is completable one-handed without visual precision, and that `onPointerLeave`/`onPointerCancel` resetting progress gives feedback rather than silently failing when a finger shifts mid-hold.
- [ ] `RouteList.tsx` `.route-card-main` vs the adjacent "Drive" button: two differently-destined targets (detail vs immediately-start-GPS) — verify spacing/size prevents mis-taps.
- [ ] `RouteDetail.tsx` run-row `.btn-small` (`min-height: 36px`): undershoots the 44 px target used elsewhere; verify adjacent Replay/Delete buttons don't invite accidental delete.

## Error / permission states

- [ ] `geolocationSource.ts` surfaces raw `GeolocationPositionError.message` into the status pill — verify a denied-permission state gives an actionable next step (how to re-enable in iOS Settings), not a dead end with no retry.
- [ ] Wake lock unsupported (<iOS 16.4) or lost: verify the small warning line doesn't read as "app broken" to a driver counting on the screen staying awake.
- [ ] `requestPersistentStorage()` is silent — verify a user who never opens Settings has *some* path to learning their data is best-effort evictable (nudge, first-save toast, etc.).

## PWA-standalone quirks

- [ ] `router.ts` `navigate()` pushes hash history, and `DriveScreen.tsx`'s unmount cleanup releases the wake lock but never calls `controller.stop()` — verify a back-gesture away from an active drive doesn't leave the geolocation watch running invisibly while silently discarding the in-progress run.
- [ ] `prompt()`/`confirm()`/`alert()` call sites (`RouteDetail.tsx` rename/deletes; `DriveScreen.tsx` finish flows): verify these render acceptably in installed standalone mode on iOS (no browser chrome) and don't clash with safe-area insets.

## Visual accessibility

- [ ] `.delta-chip` (`.delta-ahead #22c55e` / `.delta-behind #ef4444`): verify `formatDeltaMs()` output always carries an explicit +/− sign so colorblind drivers don't depend on color alone.
- [ ] `RouteDetail.tsx` `.warning-icon` (⚠) exposes the invalid-run reasons only via `title` — verify the reason text is actually reachable on touch devices (title tooltips don't fire on tap in mobile Safari).
- [ ] `.drive-status` `#9aa3ad` on `rgba(11,13,16,0.85)`: verify ≥ 4.5:1 (WCAG AA) contrast — this is read in variable outdoor glare.
