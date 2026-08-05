// D11: loads and validates `data/doc-id-aliases.json`. An alias whose
// target is absent from the manifest is a HARD BUILD ERROR, never a
// silent skip and never a runtime 404 — a static site cannot report a
// broken link to anyone once published.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { assertAliases, type Alias, type AliasMap, type ManifestDocument } from './contract';

// See data.ts for why this is process.cwd()-relative rather than
// import.meta.url-relative.
const REPO_ROOT = path.resolve(process.cwd(), '..');
export const DEFAULT_ALIASES_PATH = path.join(REPO_ROOT, 'data', 'doc-id-aliases.json');

export function loadAliasMap(filePath: string = DEFAULT_ALIASES_PATH): AliasMap {
  const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
  return assertAliases(raw);
}

/**
 * Resolve every alias against the manifest. Throws on the first alias
 * whose target doc_id is not a known record — the alternative, emitting a
 * redirect to a page that was never generated, converts a loud, fixable
 * data problem into a broken public link (design.md D11).
 */
export function resolveAliases(
  aliasMap: AliasMap,
  documents: readonly ManifestDocument[]
): readonly Alias[] {
  const knownIds = new Set(documents.map((doc) => doc.doc_id));
  for (const alias of aliasMap.aliases) {
    if (!knownIds.has(alias.target)) {
      throw new Error(
        `data/doc-id-aliases.json: alias "${alias.alias}" targets "${alias.target}", ` +
          `which is absent from the manifest`
      );
    }
  }
  return aliasMap.aliases;
}
