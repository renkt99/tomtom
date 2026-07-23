import { render } from 'preact';
import { App } from './ui/app';
import './ui/styles.css';

// Clean up the orphaned pre-Voyager tile cache: workbox's generateSW mode
// only manages caches for its current runtimeCaching entries, so a rename
// (osm-tiles -> carto-voyager) leaves the old cache behind forever unless we
// delete it ourselves.
if ('caches' in globalThis) void caches.delete('osm-tiles');

const root = document.getElementById('app');
if (root) {
  render(<App />, root);
}
