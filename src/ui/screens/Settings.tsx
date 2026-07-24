import { useEffect, useRef, useState } from 'preact/hooks';
import { exportAll, importAll } from '../../data/exportImport';
import { getSetting, setSetting } from '../../data/db';
import { isStoragePersisted, requestPersistentStorage } from '../../services/storagePersist';
import packageJson from '../../../package.json';
import { ScreenHeader } from '../components/ScreenHeader';

const LAST_BACKUP_KEY = 'lastBackupAt';

function formatBackupAge(lastBackupAt: number | null): string {
  if (lastBackupAt === null) return 'never';
  const days = Math.floor((Date.now() - lastBackupAt) / (24 * 3600 * 1000));
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

function todayDateStamp(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function Settings() {
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState<number | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    isStoragePersisted().then(setPersisted);
    getSetting<number>(LAST_BACKUP_KEY).then((v) => setLastBackupAt(v ?? null));
  }, []);

  async function handleExport() {
    const blob = await exportAll();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tomtom-backup-${todayDateStamp()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    const now = Date.now();
    await setSetting(LAST_BACKUP_KEY, now);
    setLastBackupAt(now);
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleFileChosen(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-selecting the same file later
    if (!file) return;

    setImportMessage(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const result = await importAll(json);
      setImportMessage(
        `Imported ${result.routesAdded} route${result.routesAdded === 1 ? '' : 's'}, ` +
          `${result.runsAdded} run${result.runsAdded === 1 ? '' : 's'} ` +
          `(${result.skipped} duplicate${result.skipped === 1 ? '' : 's'} skipped).`
      );
    } catch (err) {
      setImportMessage(
        `Import failed: ${err instanceof Error ? err.message : 'unknown error'}`
      );
    }
  }

  async function handleRequestPersist() {
    requestPersistentStorage();
    // Give the browser a tick to settle the request, then re-check.
    setTimeout(() => {
      isStoragePersisted().then(setPersisted);
    }, 200);
  }

  return (
    <div class="screen">
      <ScreenHeader backHash="#/" title="Settings" />

      <h2>Backup</h2>
      <p class="route-detail-meta">Last backup: {formatBackupAge(lastBackupAt)}</p>
      <button class="btn btn-primary" onClick={handleExport}>
        Export backup
      </button>
      <button class="btn btn-secondary" onClick={handleImportClick}>
        Import backup
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={handleFileChosen}
      />
      {importMessage && <p class="route-detail-meta">{importMessage}</p>}

      <h2>Storage</h2>
      <p class="route-detail-meta">
        {persisted === null
          ? 'Checking…'
          : persisted
            ? 'Storage mode: persistent'
            : 'Storage mode: best-effort (may be evicted under pressure)'}
      </p>
      {persisted === false && (
        <button class="btn btn-secondary" onClick={handleRequestPersist}>
          Request persistent storage
        </button>
      )}

      <h2>About</h2>
      <p class="route-detail-meta">
        Map data &copy;{' '}
        <a class="link" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap
        </a>{' '}
        contributors. Map tiles by{' '}
        <a class="link" href="https://carto.com/attributions" target="_blank" rel="noreferrer">
          CARTO
        </a>
        .
      </p>
      <p class="route-detail-meta">TomTom v{packageJson.version}</p>
    </div>
  );
}
