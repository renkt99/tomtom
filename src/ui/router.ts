import { signal } from '@preact/signals';

export type ScreenRoute =
  | { screen: 'list' }
  | { screen: 'new' }
  | { screen: 'detail'; id: string }
  | { screen: 'drive'; id: string }
  | { screen: 'drive-new' };

function parseHash(hash: string): ScreenRoute {
  const path = hash.replace(/^#/, '') || '/';

  if (path === '/' || path === '') return { screen: 'list' };
  if (path === '/new') return { screen: 'new' };
  if (path === '/drive-new') return { screen: 'drive-new' };

  const detailMatch = path.match(/^\/route\/([^/]+)$/);
  if (detailMatch) return { screen: 'detail', id: detailMatch[1] };

  const driveMatch = path.match(/^\/drive\/([^/]+)$/);
  if (driveMatch) return { screen: 'drive', id: driveMatch[1] };

  return { screen: 'list' };
}

function currentHash(): string {
  return globalThis.location.hash || '#/';
}

export const currentRoute = signal<ScreenRoute>(parseHash(currentHash()));

globalThis.addEventListener('hashchange', () => {
  currentRoute.value = parseHash(currentHash());
});

/** Navigate by setting location.hash, e.g. navigate('#/route/abc'). */
export function navigate(hash: string): void {
  globalThis.location.hash = hash;
}
