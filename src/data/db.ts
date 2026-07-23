import Dexie, { type Table } from 'dexie';
import type { Route, Run } from '../core/types';

export type { Route, Run };

/** Generic key/value row for the settings store (e.g. "lastBackupAt"). */
export interface SettingsRow {
  key: string;
  value: unknown;
}

export class TomTomDB extends Dexie {
  routes!: Table<Route, string>;
  runs!: Table<Run, string>;
  settings!: Table<SettingsRow, string>;

  constructor() {
    super('tomtom');

    this.version(1).stores({
      routes: 'id',
      runs: 'id, routeId, [routeId+startedAt]'
    });

    this.version(2).stores({
      routes: 'id',
      runs: 'id, routeId, [routeId+startedAt]',
      settings: 'key'
    });
  }
}

export const db = new TomTomDB();

/** Small key/value helper over the settings table. */
export async function getSetting<T>(key: string): Promise<T | undefined> {
  const row = await db.settings.get(key);
  return row?.value as T | undefined;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await db.settings.put({ key, value });
}
