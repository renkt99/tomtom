import Dexie, { type Table } from 'dexie';
import type { Route, Run } from '../core/types';

export type { Route, Run };

export class TomTomDB extends Dexie {
  routes!: Table<Route, string>;
  runs!: Table<Run, string>;

  constructor() {
    super('tomtom');

    this.version(1).stores({
      routes: 'id',
      runs: 'id, routeId, [routeId+startedAt]'
    });
  }
}

export const db = new TomTomDB();
