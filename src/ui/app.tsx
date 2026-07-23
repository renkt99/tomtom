import { signal } from '@preact/signals';
import { MapView } from './map/MapView';

function currentHash(): string {
  return globalThis.location.hash || '#/';
}

const hash = signal(currentHash());

globalThis.addEventListener('hashchange', () => {
  hash.value = currentHash();
});

function Home() {
  return (
    <div class="screen">
      <h1>TomTom</h1>
      <p>Personal drive tracker.</p>
      <a class="link" href="#/map">
        Map test
      </a>
    </div>
  );
}

export function App() {
  const route = hash.value;

  if (route === '#/map') {
    return <MapView />;
  }

  return <Home />;
}
