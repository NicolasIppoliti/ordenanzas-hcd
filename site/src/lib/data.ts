// Single filesystem read point for `data/manifest.json`, `data/sync-status.json`
// and `data/documents/{doc_id}.json` — the single swap point for D2's escape
// hatch (design.md "TypeScript mirror"). A contract violation fails the
// build; it never degrades at runtime.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { assertManifest, type Manifest, type ManifestDocument } from './contract';

// `process.cwd()` rather than `import.meta.url`: Vite bundles this module
// into `dist/` at build time, which moves its on-disk location relative
// to the source tree, but `astro build`/`astro dev`/`vitest` are always
// invoked with cwd = `site/` (e.g. `pnpm --dir site run build`).
const REPO_ROOT = path.resolve(process.cwd(), '..');
export const DEFAULT_MANIFEST_PATH = path.join(REPO_ROOT, 'data', 'manifest.json');
export const DEFAULT_SYNC_STATUS_PATH = path.join(REPO_ROOT, 'data', 'sync-status.json');

let cachedManifest: Manifest | null = null;

export function loadManifest(filePath: string = DEFAULT_MANIFEST_PATH): Manifest {
  if (filePath === DEFAULT_MANIFEST_PATH && cachedManifest) return cachedManifest;
  const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
  const manifest = assertManifest(raw);
  if (filePath === DEFAULT_MANIFEST_PATH) cachedManifest = manifest;
  return manifest;
}

export function getDocuments(): readonly ManifestDocument[] {
  return loadManifest().documents;
}

export function getDocumentById(docId: string): ManifestDocument | undefined {
  return getDocuments().find((doc) => doc.doc_id === docId);
}

export type SyncStatus = {
  readonly schema_version: 1;
  readonly last_run_at: string;
  readonly last_run_status: 'ok' | 'partial' | 'error' | 'halted';
  readonly last_success_at: string;
  readonly documents_total: number;
  readonly documents_added_last_run: number;
  readonly staleness_threshold_days: number;
  readonly halt_reason: string | null;
};

function assertSyncStatus(value: unknown): SyncStatus {
  if (typeof value !== 'object' || value === null) {
    throw new Error('sync-status.json: expected an object');
  }
  const record = value as Record<string, unknown>;
  if (typeof record.last_success_at !== 'string') {
    throw new Error('sync-status.json: last_success_at must be a string');
  }
  if (typeof record.staleness_threshold_days !== 'number') {
    throw new Error('sync-status.json: staleness_threshold_days must be a number');
  }
  if (typeof record.documents_total !== 'number') {
    throw new Error('sync-status.json: documents_total must be a number');
  }
  return record as unknown as SyncStatus;
}

export function loadSyncStatus(filePath: string = DEFAULT_SYNC_STATUS_PATH): SyncStatus {
  const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
  return assertSyncStatus(raw);
}

/**
 * Reads the extracted body text for a settled ("ok") record. Returns null
 * for any other status — a `no_text`/`pending`/`error` record never had
 * text to begin with (D2/D13).
 */
export function loadDocumentText(doc: ManifestDocument): string | null {
  if (doc.status !== 'ok' || doc.text_path === null) return null;
  const filePath = path.join(REPO_ROOT, doc.text_path);
  const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
  if (typeof raw.text !== 'string') {
    throw new Error(`${filePath}: expected a string "text" field`);
  }
  return raw.text;
}
