import { signal } from '@preact/signals';
import { useState } from 'preact/hooks';
import { navigate } from '../router';
import { ScreenHeader } from '../components/ScreenHeader';

/** Name entered here is carried over to DriveScreen's seed-mode save step. */
export const pendingRouteName = signal('');

export function NewRoute() {
  const [name, setName] = useState('');

  const canStart = name.trim().length > 0;

  function handleStart() {
    if (!canStart) return;
    pendingRouteName.value = name.trim();
    navigate('#/drive-new');
  }

  return (
    <div class="screen">
      <ScreenHeader backHash="#/" title="New route" />
      <input
        class="text-input"
        type="text"
        placeholder="Route name (e.g. Home to Work)"
        value={name}
        onInput={(e) => setName((e.target as HTMLInputElement).value)}
      />
      <button class="btn btn-primary" disabled={!canStart} onClick={handleStart}>
        Record this route by driving it
      </button>
    </div>
  );
}
