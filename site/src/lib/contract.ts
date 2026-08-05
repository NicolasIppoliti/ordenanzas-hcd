// TypeScript mirror of the pipeline/site JSON contract. See design.md
// "Interfaces / Contracts" and the "TypeScript mirror" note: this module
// declares the four types verbatim and exports `assertManifest`/
// `assertAliases`, called once each in data.ts/aliases.ts. A contract
// violation FAILS THE BUILD, never degrades at runtime.
//
// Mirrors pipeline/schemas/{manifest,aliases}.schema.json, which
// `pipeline/tests/test_contract.py` validates against the same committed
// fixtures this module's tests validate (`fixtures/contract-*.json`, repo
// root). Both sides must agree or CI fails.

export type DocType =
  | 'ordenanza'
  | 'convenio'
  | 'resolucion'
  | 'decreto'
  | 'anexo'
  | 'preparatoria'
  | 'sin clasificar';

export type Status = 'pending' | 'ok' | 'no_text' | 'error';
export type TitleSource = 'listing' | 'filename' | 'none';
export type Signal = 'title' | 'body';

export interface CrossReference {
  readonly number: number;
  readonly signal: Signal;
  readonly excerpt: string;
}

export interface ManifestDocument {
  readonly doc_id: string;
  readonly number: number | null;
  readonly number_variants: readonly string[];
  readonly doc_type: DocType;
  readonly expediente: string | null;
  readonly year: number | null;
  readonly title: string | null;
  readonly title_source: TitleSource;
  readonly anchor_text: string;
  readonly source_url: string;
  readonly source_filename: string;
  readonly sha256: string | null;
  readonly bytes: number | null;
  readonly fetched_at: string | null;
  readonly status: Status;
  readonly text_path: string | null;
  readonly cross_references: readonly CrossReference[];
  readonly notes: string;
  readonly last_error: string | null;
  readonly last_error_at: string | null;
}

export interface Manifest {
  readonly schema_version: 1;
  readonly generated_at: string;
  readonly source_host: string;
  readonly documents: readonly ManifestDocument[];
}

export interface Alias {
  readonly alias: string;
  readonly target: string;
  readonly created_at: string;
  readonly reason: string;
}

export interface AliasMap {
  readonly schema_version: 1;
  readonly generated_at: string;
  readonly aliases: readonly Alias[];
}

const DOC_TYPES = new Set<DocType>([
  'ordenanza',
  'convenio',
  'resolucion',
  'decreto',
  'anexo',
  'preparatoria',
  'sin clasificar',
]);
const STATUSES = new Set<Status>(['pending', 'ok', 'no_text', 'error']);
const TITLE_SOURCES = new Set<TitleSource>(['listing', 'filename', 'none']);
const SIGNALS = new Set<Signal>(['title', 'body']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${path}: expected a string, got ${typeof value}`);
  }
  return value;
}

function assertNonEmptyString(value: unknown, path: string): string {
  const result = assertString(value, path);
  if (result.length === 0) {
    throw new Error(`${path}: must not be empty`);
  }
  return result;
}

function assertNullableString(value: unknown, path: string): string | null {
  return value === null ? null : assertString(value, path);
}

function assertInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`${path}: expected an integer, got ${JSON.stringify(value)}`);
  }
  return value;
}

function assertNullableInteger(value: unknown, path: string): number | null {
  return value === null ? null : assertInteger(value, path);
}

function assertEnum<T extends string>(value: unknown, allowed: Set<T>, path: string): T {
  const stringValue = assertString(value, path);
  if (!allowed.has(stringValue as T)) {
    throw new Error(`${path}: invalid value ${JSON.stringify(stringValue)}`);
  }
  return stringValue as T;
}

function assertNoExtraKeys(value: Record<string, unknown>, allowed: Set<string>, path: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`${path}: unexpected key '${key}'`);
    }
  }
}

const CROSS_REFERENCE_KEYS = new Set(['number', 'signal', 'excerpt']);

function assertCrossReference(value: unknown, path: string): CrossReference {
  if (!isRecord(value)) {
    throw new Error(`${path}: expected an object`);
  }
  const number = assertInteger(value.number, `${path}.number`);
  const signal = assertEnum(value.signal, SIGNALS, `${path}.signal`);
  const excerpt = assertString(value.excerpt, `${path}.excerpt`);
  assertNoExtraKeys(value, CROSS_REFERENCE_KEYS, path);
  return { number, signal, excerpt };
}

const DOCUMENT_KEYS = new Set([
  'doc_id',
  'number',
  'number_variants',
  'doc_type',
  'expediente',
  'year',
  'title',
  'title_source',
  'anchor_text',
  'source_url',
  'source_filename',
  'sha256',
  'bytes',
  'fetched_at',
  'status',
  'text_path',
  'cross_references',
  'notes',
  'last_error',
  'last_error_at',
]);

function assertDocument(value: unknown, path: string): ManifestDocument {
  if (!isRecord(value)) {
    throw new Error(`${path}: expected an object`);
  }

  const doc_id = assertNonEmptyString(value.doc_id, `${path}.doc_id`);
  const number = assertNullableInteger(value.number, `${path}.number`);

  if (!Array.isArray(value.number_variants)) {
    throw new Error(`${path}.number_variants: expected an array`);
  }
  const number_variants = value.number_variants.map((entry, index) =>
    assertString(entry, `${path}.number_variants[${index}]`)
  );

  const doc_type = assertEnum(value.doc_type, DOC_TYPES, `${path}.doc_type`);
  const expediente = assertNullableString(value.expediente, `${path}.expediente`);
  const year = assertNullableInteger(value.year, `${path}.year`);
  const title = assertNullableString(value.title, `${path}.title`);
  const title_source = assertEnum(value.title_source, TITLE_SOURCES, `${path}.title_source`);
  const anchor_text = assertString(value.anchor_text, `${path}.anchor_text`);
  const source_url = assertString(value.source_url, `${path}.source_url`);
  const source_filename = assertString(value.source_filename, `${path}.source_filename`);
  const sha256 = assertNullableString(value.sha256, `${path}.sha256`);
  const documentBytes = assertNullableInteger(value.bytes, `${path}.bytes`);
  const fetched_at = assertNullableString(value.fetched_at, `${path}.fetched_at`);
  const status = assertEnum(value.status, STATUSES, `${path}.status`);
  const text_path = assertNullableString(value.text_path, `${path}.text_path`);

  if (!Array.isArray(value.cross_references)) {
    throw new Error(`${path}.cross_references: expected an array`);
  }
  const cross_references = value.cross_references.map((entry, index) =>
    assertCrossReference(entry, `${path}.cross_references[${index}]`)
  );

  const notes = assertString(value.notes, `${path}.notes`);
  const last_error = assertNullableString(value.last_error, `${path}.last_error`);
  const last_error_at = assertNullableString(value.last_error_at, `${path}.last_error_at`);

  assertNoExtraKeys(value, DOCUMENT_KEYS, path);

  return {
    doc_id,
    number,
    number_variants,
    doc_type,
    expediente,
    year,
    title,
    title_source,
    anchor_text,
    source_url,
    source_filename,
    sha256,
    bytes: documentBytes,
    fetched_at,
    status,
    text_path,
    cross_references,
    notes,
    last_error,
    last_error_at,
  };
}

const MANIFEST_KEYS = new Set(['schema_version', 'generated_at', 'source_host', 'documents']);

/** Validate and narrow unknown JSON into a `Manifest`. Throws on any violation. */
export function assertManifest(value: unknown): Manifest {
  if (!isRecord(value)) {
    throw new Error('manifest: expected an object');
  }
  if (value.schema_version !== 1) {
    throw new Error(`manifest.schema_version: expected 1, got ${JSON.stringify(value.schema_version)}`);
  }
  const generated_at = assertString(value.generated_at, 'manifest.generated_at');
  const source_host = assertString(value.source_host, 'manifest.source_host');

  if (!Array.isArray(value.documents)) {
    throw new Error('manifest.documents: expected an array');
  }
  const documents = value.documents.map((doc, index) =>
    assertDocument(doc, `manifest.documents[${index}]`)
  );

  assertNoExtraKeys(value, MANIFEST_KEYS, 'manifest');

  return { schema_version: 1, generated_at, source_host, documents };
}

const ALIAS_KEYS = new Set(['alias', 'target', 'created_at', 'reason']);

function assertAlias(value: unknown, path: string): Alias {
  if (!isRecord(value)) {
    throw new Error(`${path}: expected an object`);
  }
  const alias = assertNonEmptyString(value.alias, `${path}.alias`);
  const target = assertNonEmptyString(value.target, `${path}.target`);
  const created_at = assertString(value.created_at, `${path}.created_at`);
  const reason = assertString(value.reason, `${path}.reason`);
  assertNoExtraKeys(value, ALIAS_KEYS, path);
  return { alias, target, created_at, reason };
}

const ALIAS_MAP_KEYS = new Set(['schema_version', 'generated_at', 'aliases']);

/** Validate and narrow unknown JSON into an `AliasMap`. Throws on any violation. */
export function assertAliases(value: unknown): AliasMap {
  if (!isRecord(value)) {
    throw new Error('aliases: expected an object');
  }
  if (value.schema_version !== 1) {
    throw new Error(`aliases.schema_version: expected 1, got ${JSON.stringify(value.schema_version)}`);
  }
  const generated_at = assertString(value.generated_at, 'aliases.generated_at');

  if (!Array.isArray(value.aliases)) {
    throw new Error('aliases.aliases: expected an array');
  }
  const aliases = value.aliases.map((entry, index) => assertAlias(entry, `aliases.aliases[${index}]`));

  assertNoExtraKeys(value, ALIAS_MAP_KEYS, 'aliases');

  return { schema_version: 1, generated_at, aliases };
}
