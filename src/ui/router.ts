import { signal } from '@preact/signals';

export type ScreenRoute =
  | { screen: 'list' }
  | { screen: 'new' }
  | { screen: 'detail'; id: string }
  | { screen: 'drive'; id: string; replayRunId: string | null }
  | { screen: 'drive-new' }
  | { screen: 'settings' };

function parseHash(hash: string): ScreenRoute {
  const withoutHash = hash.replace(/^#/, '') || '/';
  const [rawPath, rawQuery] = withoutHash.split('?', 2);
  const path = rawPath || '/';
  const query = new URLSearchParams(rawQuery ?? '');

  if (path === '/' || path === '') return { screen: 'list' };
  if (path === '/new') return { screen: 'new' };
  if (path === '/drive-new') return { screen: 'drive-new' };
  if (path === '/settings') return { screen: 'settings' };

  const detailMatch = path.match(/^\/route\/([^/]+)$/);
  if (detailMatch) return { screen: 'detail', id: detailMatch[1] };

  const driveMatch = path.match(/^\/drive\/([^/]+)$/);
  if (driveMatch) {
    return {
      screen: 'drive',
      id: driveMatch[1],
      replayRunId: query.get('replay')
    };
  }

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
